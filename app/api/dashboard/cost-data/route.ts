import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

const CRON_NAMES = [
  "pulse-check",
  "backfill-behavior",
  "token-summary",
  "escalation-scan",
  "cleanup-context",
  "sync-gorgias-users",
  "weekly-behavior-report",
  "backtest-confidence",
] as const;

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    const oneDayAgo = new Date(now.getTime() - 86400000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Build week boundaries (last 8 weeks) for reporting rollups
    const weeks: { start: Date; end: Date; label: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      weeks.push({ start, end, label });
    }
    const eightWeeksAgo = weeks[0].start;

    const [
      // 1. Cost KPIs — current 30d
      currentCostAgg,
      // 1. Cost KPIs — previous 30d (for delta)
      previousCostAgg,
      // 1. Cost KPIs — ticket counts
      pulseRows,
      // 2. Cost breakdown by source+model
      costGrouped,
      // 3. Cost trend — raw rows for 30d
      costTrendRows,
      // 4. Token by intent
      tokenByIntentRows,
      // 6. Data flow — webhook health: events today
      eventsToday,
      // 6. Data flow — webhook health: errors today
      errorsToday,
      // 6. Data flow — API health: aggregate
      apiAgg,
      // 6. Data flow — API health: errors
      apiErrors,
      // 6. Data flow — API health: slowest endpoints
      slowEndpoints,
      // 7. Weekly rollup data — pulse
      weeklyPulseRows,
      // 7. Weekly rollup data — behavior
      weeklyBehaviorRows,
      // 7. Weekly rollup data — token totals
      weeklyTokenRows,
      // 7. Weekly rollup data — feedback
      weeklyFeedbackRows,
    ] = await Promise.all([
      // 1a. current 30d cost aggregate
      prisma.aiTokenUsage.aggregate({
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { costUsd: true, totalTokens: true },
      }),
      // 1b. previous 30d cost aggregate
      prisma.aiTokenUsage.aggregate({
        where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        _sum: { costUsd: true },
      }),
      // 1c. pulse check ticket counts (30d)
      prisma.pulseCheck.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { ticketCount: true },
      }),
      // 2. cost breakdown
      prisma.aiTokenUsage.groupBy({
        by: ["source", "model"],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { costUsd: true },
        _count: true,
      }),
      // 3. cost trend — all rows for 30d (group in JS)
      prisma.aiTokenUsage.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, costUsd: true, totalTokens: true },
        orderBy: { createdAt: "asc" },
      }),
      // 4. token by intent
      prisma.apiLog.groupBy({
        by: ["intent"],
        where: { createdAt: { gte: thirtyDaysAgo }, intent: { not: null } },
        _sum: { tokenCount: true },
        _count: true,
      }),
      // 6a. webhook events today
      prisma.agentBehaviorLog.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // 6b. webhook errors today
      prisma.performanceMetric.count({
        where: { metric: { contains: "error" }, createdAt: { gte: todayStart } },
      }),
      // 6c. API health aggregate (24h)
      prisma.apiLog.aggregate({
        where: { createdAt: { gte: oneDayAgo } },
        _avg: { duration: true },
        _count: true,
      }),
      // 6d. API errors (24h)
      prisma.apiLog.count({
        where: { createdAt: { gte: oneDayAgo }, status: { gte: 500 } },
      }),
      // 6e. Slowest endpoints (24h)
      prisma.apiLog.groupBy({
        by: ["endpoint"],
        where: { createdAt: { gte: oneDayAgo } },
        _avg: { duration: true },
      }),
      // 7a. pulse rows for weekly rollups
      prisma.pulseCheck.findMany({
        where: { createdAt: { gte: eightWeeksAgo } },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          ticketCount: true,
          openTickets: true,
          closedTickets: true,
          avgResolutionMin: true,
          resolutionP90Min: true,
          spamRate: true,
        },
      }),
      // 7b. behavior rows for weekly rollups
      prisma.agentBehaviorLog.findMany({
        where: { occurredAt: { gte: eightWeeksAgo } },
        select: {
          agent: true,
          action: true,
          occurredAt: true,
        },
      }),
      // 7c. token totals (3 months)
      prisma.aiTokenUsage.aggregate({
        where: { createdAt: { gte: eightWeeksAgo } },
        _sum: { totalTokens: true, costUsd: true },
        _count: { id: true },
      }),
      // 7d. feedback rows for weekly rollups
      prisma.ticketAnalytics.findMany({
        where: { aiMatchesHuman: { not: null }, updatedAt: { gte: eightWeeksAgo } },
        select: { aiMatchesHuman: true, updatedAt: true },
      }),
    ]);

    // Fetch cron health sequentially (8 queries, each is a simple findFirst)
    const cronHealth = await Promise.all(
      CRON_NAMES.map(async (cronName) => {
        const metric = await prisma.performanceMetric.findFirst({
          where: { metric: { contains: cronName } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, value: true },
        });
        return {
          name: cronName,
          lastRun: metric?.createdAt.toISOString() ?? null,
          success: metric ? metric.value >= 0 : false,
        };
      }),
    );

    // --- 1. Cost KPIs ---

    const currentCost = currentCostAgg._sum.costUsd ?? 0;
    const previousCost = previousCostAgg._sum.costUsd ?? 0;
    const totalTokens = currentCostAgg._sum.totalTokens ?? 0;
    const totalTickets = pulseRows.reduce((s, p) => s + (p.ticketCount ?? 0), 0);
    const costPerTicket = totalTickets > 0
      ? Math.round((currentCost / totalTickets) * 100) / 100
      : null;
    const costDelta = previousCost > 0
      ? Math.round(((currentCost - previousCost) / previousCost) * 1000) / 10
      : null;

    const kpis = {
      totalCost30d: Math.round(currentCost * 100) / 100,
      costDelta,
      costPerTicket,
      totalTokens,
    };

    // --- 2. Cost Breakdown ---

    const costBreakdown = costGrouped
      .map((row) => ({
        category: `${row.source} / ${row.model.split("/").pop() ?? row.model}`,
        totalCost: Math.round((row._sum.costUsd ?? 0) * 1000) / 1000,
        requestCount: row._count,
      }))
      .filter((r) => r.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost);

    // --- 3. Cost Trend (group by date in JS) ---

    const trendMap = new Map<string, { costUsd: number; tokens: number }>();
    for (const row of costTrendRows) {
      const date = row.createdAt.toISOString().split("T")[0];
      const existing = trendMap.get(date) ?? { costUsd: 0, tokens: 0 };
      existing.costUsd += row.costUsd;
      existing.tokens += row.totalTokens;
      trendMap.set(date, existing);
    }
    const costTrend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        costUsd: Math.round(data.costUsd * 1000) / 1000,
        tokens: data.tokens,
      }));

    // --- 4. Token by Intent ---

    const tokenByIntent = tokenByIntentRows
      .map((row) => ({
        intent: row.intent!,
        count: row._count,
        totalTokens: row._sum.tokenCount ?? 0,
      }))
      .filter((r) => r.totalTokens > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens);

    // --- 5. Peak Usage (group by hour in JS) ---

    const hourMap = new Map<number, { tokens: number; costUsd: number }>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { tokens: 0, costUsd: 0 });
    }
    for (const row of costTrendRows) {
      const hour = row.createdAt.getHours();
      const existing = hourMap.get(hour)!;
      existing.tokens += row.totalTokens;
      existing.costUsd += row.costUsd;
    }
    const peakUsage = Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({
        hour,
        tokens: data.tokens,
        costUsd: Math.round(data.costUsd * 1000) / 1000,
      }));

    // --- 6. Data Flow Health ---

    const totalApiRequests = apiAgg._count;
    const webhookHealth = {
      eventsToday,
      errorsToday,
      errorRate: eventsToday > 0
        ? Math.round((errorsToday / eventsToday) * 1000) / 10
        : 0,
    };

    const apiHealth = {
      avgDurationMs: apiAgg._avg.duration != null
        ? Math.round(apiAgg._avg.duration)
        : null,
      errorRate: totalApiRequests > 0
        ? Math.round((apiErrors / totalApiRequests) * 1000) / 10
        : 0,
      totalRequests: totalApiRequests,
      slowEndpoints: slowEndpoints
        .filter((e) => e._avg.duration != null)
        .map((e) => ({
          endpoint: e.endpoint,
          avgMs: Math.round(e._avg.duration!),
        }))
        .sort((a, b) => b.avgMs - a.avgMs)
        .slice(0, 5),
    };

    // --- 7. Weekly Rollups ---

    const weeklyRollups = weeks.map((w) => {
      const pulses = weeklyPulseRows.filter(
        (p) => p.createdAt >= w.start && p.createdAt <= w.end,
      );
      const behaviors = weeklyBehaviorRows.filter(
        (b) => b.occurredAt && b.occurredAt >= w.start && b.occurredAt <= w.end,
      );
      const feedback = weeklyFeedbackRows.filter(
        (f) => f.updatedAt >= w.start && f.updatedAt <= w.end,
      );

      const wTickets = pulses.reduce((s, p) => s + (p.ticketCount ?? 0), 0);
      const avgResolution =
        pulses.length > 0
          ? Math.round(
              pulses.reduce((s, p) => s + (p.avgResolutionMin ?? 0), 0) /
                pulses.length,
            )
          : null;
      const avgP90 =
        pulses.length > 0
          ? Math.round(
              pulses.reduce((s, p) => s + (p.resolutionP90Min ?? 0), 0) /
                pulses.length,
            )
          : null;
      const avgSpam =
        pulses.length > 0
          ? Math.round(
              (pulses.reduce((s, p) => s + (p.spamRate ?? 0), 0) /
                pulses.length) *
                10,
            ) / 10
          : null;

      const agentMap = new Map<string, number>();
      for (const b of behaviors) {
        if (b.agent) agentMap.set(b.agent, (agentMap.get(b.agent) ?? 0) + 1);
      }
      const agentBreakdown = Array.from(agentMap.entries())
        .map(([agent, actions]) => ({ agent, actions }))
        .sort((a, b) => b.actions - a.actions);

      const fbTotal = feedback.length;
      const fbCorrect = feedback.filter((f) => f.aiMatchesHuman).length;

      return {
        week: w.label,
        totalTickets: wTickets,
        avgResolutionMin: avgResolution,
        p90Min: avgP90,
        spamPct: avgSpam,
        agentActions: behaviors.length,
        agentBreakdown,
        aiAccuracy:
          fbTotal > 0
            ? Math.round((fbCorrect / fbTotal) * 1000) / 10
            : null,
        aiJudged: fbTotal,
      };
    });

    // Monthly summary (last 3 months)
    const months: { start: Date; end: Date; label: string }[] = [];
    for (let i = 2; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      months.push({
        start,
        end,
        label: start.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
      });
    }
    const monthlySummary = months.map((m) => {
      const mPulses = weeklyPulseRows.filter(
        (p) => p.createdAt >= m.start && p.createdAt <= m.end,
      );
      const mBehaviors = weeklyBehaviorRows.filter(
        (b) => b.occurredAt && b.occurredAt >= m.start && b.occurredAt <= m.end,
      );
      return {
        month: m.label,
        totalTickets: mPulses.reduce(
          (s, p) => s + (p.ticketCount ?? 0),
          0,
        ),
        avgResolutionMin:
          mPulses.length > 0
            ? Math.round(
                mPulses.reduce(
                  (s, p) => s + (p.avgResolutionMin ?? 0),
                  0,
                ) / mPulses.length,
              )
            : null,
        totalAgentActions: mBehaviors.length,
        pulseChecks: mPulses.length,
      };
    });

    return NextResponse.json({
      kpis,
      costBreakdown,
      costTrend,
      tokenByIntent,
      peakUsage,
      cronHealth,
      webhookHealth,
      apiHealth,
      reporting: {
        weeklyRollups,
        monthlySummary,
        aiCosts: {
          totalRequests: weeklyTokenRows._count.id,
          totalTokens: weeklyTokenRows._sum.totalTokens ?? 0,
          totalCostUsd:
            Math.round((weeklyTokenRows._sum.costUsd ?? 0) * 100) / 100,
        },
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/cost-data] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 },
    );
  }
}
