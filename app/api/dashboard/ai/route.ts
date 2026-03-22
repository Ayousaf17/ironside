import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTierReadiness } from "@/lib/analytics/tier-readiness";

export const maxDuration = 30;

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const MANUAL_AVG_MIN = 15;

    // Parallel queries for all data we need
    const [
      judgedRows,
      recentCorrections,
      tokenUsage,
      costGrouped,
      pulseRows,
      ticketAnalytics,
      tierReadiness,
      sentimentRows,
    ] = await Promise.all([
      // All rows with a human judgement (for accuracy + matrix)
      prisma.ticketAnalytics.findMany({
        where: { aiMatchesHuman: { not: null }, createdAt: { gte: thirtyDaysAgo } },
        select: {
          ticketId: true,
          aiMatchesHuman: true,
          aiClassification: true,
          humanClassification: true,
          updatedAt: true,
        },
      }),
      // Recent mismatches (for feedback.recentCorrections)
      prisma.ticketAnalytics.findMany({
        where: {
          aiMatchesHuman: false,
          humanClassification: { not: null },
          aiClassification: { not: null },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          ticketId: true,
          aiClassification: true,
          humanClassification: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      // Token cost aggregate
      prisma.aiTokenUsage.aggregate({
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { costUsd: true },
      }),
      // Cost breakdown by source+model
      prisma.aiTokenUsage.groupBy({
        by: ["source", "model"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { costUsd: true },
        _count: true,
      }),
      // Pulse check ticket counts
      prisma.pulseCheck.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { ticketCount: true },
      }),
      // Ticket analytics for resolution time + cost savings
      prisma.ticketAnalytics.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: {
          resolutionTimeMin: true,
          costSavingsUsd: true,
        },
      }),
      // Tier readiness
      getTierReadiness(),
      // Sentiment data from auto_triage behavior logs
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          action: "auto_triage",
        },
        select: { rawEvent: true, occurredAt: true },
      }),
    ]);

    // --- KPIs ---

    const totalJudged = judgedRows.length;
    const totalCorrect = judgedRows.filter((r) => r.aiMatchesHuman === true).length;
    const accuracy = totalJudged > 0
      ? Math.round((totalCorrect / totalJudged) * 1000) / 10
      : null;

    const totalLlmCost = Math.round((tokenUsage._sum.costUsd ?? 0) * 100) / 100;
    const totalTickets = pulseRows.reduce((s, p) => s + (p.ticketCount ?? 0), 0);
    const costPerTicket = totalTickets > 0
      ? Math.round((totalLlmCost / totalTickets) * 100) / 100
      : null;

    // Time-saved estimation
    const aiAssistedTimes = ticketAnalytics
      .filter((t) => t.resolutionTimeMin != null)
      .map((t) => t.resolutionTimeMin!);
    const avgAiAssistedMin = aiAssistedTimes.length > 0
      ? Math.round(aiAssistedTimes.reduce((s, v) => s + v, 0) / aiAssistedTimes.length * 10) / 10
      : null;
    const savedPerTicketMin = avgAiAssistedMin != null
      ? Math.max(0, MANUAL_AVG_MIN - avgAiAssistedMin)
      : null;
    const totalSavedHours = savedPerTicketMin != null && totalTickets > 0
      ? Math.round((savedPerTicketMin * totalTickets) / 60 * 10) / 10
      : null;

    const totalCostSavings = Math.round(
      ticketAnalytics
        .filter((t) => t.costSavingsUsd != null)
        .reduce((s, t) => s + (t.costSavingsUsd ?? 0), 0) * 100
    ) / 100;

    // --- Tier Readiness ---

    const tierReadinessResult = tierReadiness.map((r) => ({
      category: r.category,
      tier: r.tier,
      accuracy: Math.round(r.accuracy * 1000) / 10,
      ticketCount: r.ticketCount,
      avgConfidence: Math.round(r.avgConfidence * 1000) / 10,
    }));

    // --- Feedback ---

    const overallAccuracy = totalJudged > 0
      ? Math.round((totalCorrect / totalJudged) * 1000) / 10
      : null;

    // Misclassification matrix
    const matrixMap = new Map<string, number>();
    for (const row of judgedRows) {
      if (row.aiMatchesHuman === false && row.aiClassification && row.humanClassification) {
        const key = `${row.aiClassification}\u2192${row.humanClassification}`;
        matrixMap.set(key, (matrixMap.get(key) ?? 0) + 1);
      }
    }
    const matrix = Array.from(matrixMap.entries())
      .map(([key, count]) => {
        const [aiCategory, humanCategory] = key.split("\u2192");
        return { aiCategory, humanCategory, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // --- Sentiment Trend ---

    const sentimentByDay = new Map<string, { angry: number; frustrated: number; happy: number; neutral: number }>();
    for (const s of sentimentRows) {
      const day = s.occurredAt.toISOString().split("T")[0];
      if (!sentimentByDay.has(day)) {
        sentimentByDay.set(day, { angry: 0, frustrated: 0, happy: 0, neutral: 0 });
      }
      const raw = s.rawEvent as Record<string, unknown> | null;
      const sentiment = (raw?.sentiment as string) ?? "neutral";
      const dayData = sentimentByDay.get(day)!;
      if (sentiment in dayData) dayData[sentiment as keyof typeof dayData]++;
    }
    const sentimentTrend = Array.from(sentimentByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // --- Cost Breakdown ---

    const costBreakdown = costGrouped
      .map((row) => ({
        category: `${row.source} / ${row.model.split("/").pop() ?? row.model}`,
        totalCost: Math.round((row._sum.costUsd ?? 0) * 1000) / 1000,
        requestCount: row._count,
      }))
      .filter((r) => r.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost);

    // --- Assemble response ---

    return NextResponse.json({
      kpis: {
        accuracy,
        judged: totalJudged,
        costPerTicket,
        totalLlmCost,
        totalSavedHours,
        savedPerTicketMin,
        totalCostSavings,
      },
      tierReadiness: tierReadinessResult,
      feedback: {
        overallAccuracy,
        recentCorrections: recentCorrections.map((r) => ({
          ticketId: r.ticketId,
          aiCategory: r.aiClassification!,
          humanCategory: r.humanClassification!,
          correctedAt: r.updatedAt.toISOString(),
        })),
        matrix,
      },
      sentimentTrend,
      costBreakdown,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/ai] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
