import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTierReadiness } from "@/lib/analytics/tier-readiness";

export const maxDuration = 30;

// ISO week string helper (YYYY-Www)
function isoWeek(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [
      tierReadiness,
      judgedRows,
      confidenceRows,
      allAnalytics,
      recentCorrections,
      lastBacktestMetric,
      sentimentRows,
    ] = await Promise.all([
      // 1. Tier readiness
      getTierReadiness(),

      // 2. Accuracy trend — rows with human judgement
      prisma.ticketAnalytics.findMany({
        where: { aiMatchesHuman: { not: null } },
        select: {
          aiMatchesHuman: true,
          updatedAt: true,
          category: true,
          aiClassification: true,
          humanClassification: true,
          ticketId: true,
        },
      }),

      // 3. Confidence distribution
      prisma.ticketAnalytics.findMany({
        where: { aiConfidenceScore: { not: null } },
        select: { aiConfidenceScore: true },
      }),

      // 4. AI vs Human comparison — all analytics with category
      prisma.ticketAnalytics.findMany({
        where: { category: { not: null } },
        select: {
          category: true,
          aiMatchesHuman: true,
          aiMessageCount: true,
          humanMessageCount: true,
          resolutionTimeMin: true,
          costSavingsUsd: true,
        },
      }),

      // 5. Recent corrections
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

      // 6. Backtest summary
      prisma.performanceMetric.findFirst({
        where: { metric: { contains: "backtest" } },
        orderBy: { createdAt: "desc" },
      }),

      // 7. Sentiment trend
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          action: "auto_triage",
        },
        select: { rawEvent: true, occurredAt: true },
      }),
    ]);

    // --- 1. Tier Summary ---

    const tierSummary = { t1: 0, t2: 0, t3: 0, insufficient: 0 };
    const tierReadinessResult = tierReadiness.map((r) => {
      if (r.tier === "T1") tierSummary.t1++;
      else if (r.tier === "T2") tierSummary.t2++;
      else if (r.tier === "T3") tierSummary.t3++;
      else tierSummary.insufficient++;

      return {
        category: r.category,
        tier: r.tier,
        accuracy: Math.round(r.accuracy * 1000) / 10,
        ticketCount: r.ticketCount,
        avgConfidence: Math.round(r.avgConfidence * 1000) / 10,
      };
    });

    // --- 2. Accuracy Trend (by ISO week + category) ---

    const weekCatMap = new Map<string, { correct: number; total: number }>();
    for (const row of judgedRows) {
      const week = isoWeek(row.updatedAt);
      const cat = row.category || "unknown";
      const key = `${week}|${cat}`;
      const entry = weekCatMap.get(key) ?? { correct: 0, total: 0 };
      entry.total++;
      if (row.aiMatchesHuman === true) entry.correct++;
      weekCatMap.set(key, entry);
    }
    const accuracyTrend = Array.from(weekCatMap.entries())
      .map(([key, val]) => {
        const [week, category] = key.split("|");
        return {
          week,
          category,
          accuracy: val.total > 0 ? Math.round((val.correct / val.total) * 1000) / 10 : 0,
          count: val.total,
        };
      })
      .sort((a, b) => a.week.localeCompare(b.week));

    // --- 3. Confidence Distribution (10 bins) ---

    const bins = Array.from({ length: 10 }, (_, i) => ({
      bin: `${i * 10}-${(i + 1) * 10}`,
      count: 0,
    }));
    for (const row of confidenceRows) {
      const score = row.aiConfidenceScore ?? 0;
      const idx = Math.min(Math.floor(score / 10), 9);
      bins[idx].count++;
    }
    const confidenceDistribution = bins;

    // --- 4. AI vs Human Comparison ---

    const catStats = new Map<
      string,
      {
        judged: number;
        correct: number;
        aiMsgSum: number;
        aiMsgCount: number;
        humanMsgSum: number;
        humanMsgCount: number;
        resTimeSum: number;
        resTimeCount: number;
        costSavings: number;
      }
    >();
    for (const row of allAnalytics) {
      const cat = row.category!;
      const entry = catStats.get(cat) ?? {
        judged: 0,
        correct: 0,
        aiMsgSum: 0,
        aiMsgCount: 0,
        humanMsgSum: 0,
        humanMsgCount: 0,
        resTimeSum: 0,
        resTimeCount: 0,
        costSavings: 0,
      };

      if (row.aiMatchesHuman !== null) {
        entry.judged++;
        if (row.aiMatchesHuman === true) entry.correct++;
      }
      if (row.aiMessageCount != null) {
        entry.aiMsgSum += row.aiMessageCount;
        entry.aiMsgCount++;
      }
      if (row.humanMessageCount != null) {
        entry.humanMsgSum += row.humanMessageCount;
        entry.humanMsgCount++;
      }
      if (row.resolutionTimeMin != null) {
        entry.resTimeSum += row.resolutionTimeMin;
        entry.resTimeCount++;
      }
      if (row.costSavingsUsd != null) {
        entry.costSavings += row.costSavingsUsd;
      }
      catStats.set(cat, entry);
    }

    const aiVsHuman = Array.from(catStats.entries())
      .map(([category, s]) => ({
        category,
        accuracy: s.judged > 0 ? Math.round((s.correct / s.judged) * 1000) / 10 : null,
        avgAiMessages: s.aiMsgCount > 0 ? Math.round((s.aiMsgSum / s.aiMsgCount) * 10) / 10 : null,
        avgHumanMessages: s.humanMsgCount > 0 ? Math.round((s.humanMsgSum / s.humanMsgCount) * 10) / 10 : null,
        avgResolutionMin: s.resTimeCount > 0 ? Math.round((s.resTimeSum / s.resTimeCount) * 10) / 10 : null,
        costSavingsUsd: Math.round(s.costSavings * 100) / 100,
      }))
      .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));

    // --- 5. Confusion Matrix ---

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

    // Recent corrections
    const corrections = recentCorrections.map((r) => ({
      ticketId: r.ticketId,
      aiCategory: r.aiClassification!,
      humanCategory: r.humanClassification!,
      correctedAt: r.updatedAt.toISOString(),
    }));

    // --- 6. Backtest Summary ---

    let lastBacktest: { ranAt: string; categoriesUpdated: number } | null = null;
    if (lastBacktestMetric) {
      const ctx = lastBacktestMetric.context as Record<string, unknown> | null;
      lastBacktest = {
        ranAt: lastBacktestMetric.createdAt.toISOString(),
        categoriesUpdated:
          typeof ctx?.categoriesUpdated === "number" ? ctx.categoriesUpdated : 0,
      };
    }

    // --- 7. Sentiment Trend ---

    const sentimentByDay = new Map<
      string,
      { angry: number; frustrated: number; happy: number; neutral: number }
    >();
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

    // --- 8. Per-category Cost Savings ---

    const costByCategory = new Map<string, number>();
    for (const row of allAnalytics) {
      if (row.costSavingsUsd != null && row.category) {
        costByCategory.set(
          row.category,
          (costByCategory.get(row.category) ?? 0) + row.costSavingsUsd,
        );
      }
    }
    const categoryCostSavings = Array.from(costByCategory.entries())
      .map(([category, total]) => ({
        category,
        costSavingsUsd: Math.round(total * 100) / 100,
      }))
      .filter((r) => r.costSavingsUsd > 0)
      .sort((a, b) => b.costSavingsUsd - a.costSavingsUsd);

    // --- Assemble response ---

    return NextResponse.json({
      tierSummary,
      tierReadiness: tierReadinessResult,
      accuracyTrend,
      confidenceDistribution,
      aiVsHuman,
      feedback: {
        matrix,
        recentCorrections: corrections,
      },
      lastBacktest,
      sentimentTrend,
      categoryCostSavings,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/tier-readiness] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 },
    );
  }
}
