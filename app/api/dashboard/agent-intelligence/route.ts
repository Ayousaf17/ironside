import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Return ISO week string for a date, e.g. "2026-W12" */
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday (ISO week rule)
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  GET /api/dashboard/agent-intelligence                              */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    const [
      leaderboardRows,
      trendRows,
      categoryRows,
      workloadRows,
      macroRows,
      macroTimingRows,
      noMacroTimingRows,
      escalationRows,
      recentRows,
    ] = await Promise.all([
      // 1. Leaderboard — all behavior in 30d
      prisma.agentBehaviorLog.findMany({
        where: { occurredAt: { gte: thirtyDaysAgo } },
        select: {
          agent: true,
          action: true,
          timeToRespondMin: true,
          csatScore: true,
          reopened: true,
          responseCharCount: true,
          isFirstResponse: true,
        },
      }),

      // 2. Per-agent response time trend
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          timeToRespondMin: { not: null },
        },
        select: {
          agent: true,
          occurredAt: true,
          timeToRespondMin: true,
        },
      }),

      // 3. Per-agent category breakdown
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          category: { not: null },
        },
        select: {
          agent: true,
          category: true,
        },
      }),

      // 4. Workload by day (14d)
      prisma.agentBehaviorLog.findMany({
        where: { occurredAt: { gte: fourteenDaysAgo } },
        select: {
          agent: true,
          occurredAt: true,
        },
      }),

      // 5a. Macro stats (where macro was used)
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          macroIdUsed: { not: null },
          macroName: { not: null },
        },
        select: {
          agent: true,
          macroName: true,
          timeToRespondMin: true,
          category: true,
        },
      }),

      // 5b. With macro — category timing
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          macroIdUsed: { not: null },
          category: { not: null },
          timeToRespondMin: { not: null },
        },
        select: {
          category: true,
          timeToRespondMin: true,
        },
      }),

      // 5c. Without macro — category timing
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          macroIdUsed: null,
          category: { not: null },
          timeToRespondMin: { not: null },
        },
        select: {
          category: true,
          timeToRespondMin: true,
        },
      }),

      // 6. Escalation patterns
      prisma.agentBehaviorLog.findMany({
        where: {
          occurredAt: { gte: thirtyDaysAgo },
          action: "escalation",
        },
        select: {
          agent: true,
          category: true,
        },
      }),

      // 7. Recent activity (last 50)
      prisma.agentBehaviorLog.findMany({
        orderBy: { occurredAt: "desc" },
        take: 50,
        select: {
          agent: true,
          action: true,
          ticketId: true,
          ticketSubject: true,
          occurredAt: true,
        },
      }),
    ]);

    // ---------------------------------------------------------------
    // 1. Leaderboard (carry forward from team/route.ts + new fields)
    // ---------------------------------------------------------------

    const agentMap = new Map<
      string,
      {
        actions: number;
        replies: number;
        closes: number;
        escalations: number;
        responseTimes: number[];
        csatScores: number[];
        reopens: number;
        charCounts: number[];
        firstResponseYes: number;
        firstResponseTotal: number;
      }
    >();

    for (const b of leaderboardRows) {
      if (!b.agent || b.agent === "system") continue;
      if (!agentMap.has(b.agent)) {
        agentMap.set(b.agent, {
          actions: 0,
          replies: 0,
          closes: 0,
          escalations: 0,
          responseTimes: [],
          csatScores: [],
          reopens: 0,
          charCounts: [],
          firstResponseYes: 0,
          firstResponseTotal: 0,
        });
      }
      const a = agentMap.get(b.agent)!;
      a.actions++;
      if (b.action === "reply" || b.action === "reply_ticket") a.replies++;
      if (b.action === "close") a.closes++;
      if (b.action === "escalation") a.escalations++;
      if (b.timeToRespondMin != null) a.responseTimes.push(b.timeToRespondMin);
      if (b.csatScore != null) a.csatScores.push(b.csatScore);
      if (b.reopened) a.reopens++;
      if (b.responseCharCount != null) a.charCounts.push(b.responseCharCount);
      if (b.isFirstResponse != null) {
        a.firstResponseTotal++;
        if (b.isFirstResponse) a.firstResponseYes++;
      }
    }

    const leaderboard = Array.from(agentMap.entries())
      .map(([name, s]) => {
        const avgResponseMin =
          s.responseTimes.length > 0
            ? Math.round(
                (s.responseTimes.reduce((sum, v) => sum + v, 0) /
                  s.responseTimes.length) *
                  10,
              ) / 10
            : null;
        const avgCsat =
          s.csatScores.length > 0
            ? Math.round(
                (s.csatScores.reduce((sum, v) => sum + v, 0) /
                  s.csatScores.length) *
                  10,
              ) / 10
            : null;
        const escalationRate =
          s.actions > 0
            ? Math.round((s.escalations / s.actions) * 10000) / 100
            : 0;

        const avgCharCount =
          s.charCounts.length > 0
            ? Math.round(
                s.charCounts.reduce((sum, v) => sum + v, 0) /
                  s.charCounts.length,
              )
            : null;

        const firstResponseRate =
          s.firstResponseTotal > 0
            ? Math.round(
                (s.firstResponseYes / s.firstResponseTotal) * 10000,
              ) / 100
            : null;

        // Composite score
        let score = 50;
        if (avgResponseMin != null) score += Math.max(0, 30 - avgResponseMin);
        if (avgCsat != null) score += avgCsat * 4;
        if (s.actions > 0) score -= (s.escalations / s.actions) * 20;

        return {
          agent: name.split("@")[0],
          score: Math.round(score),
          totalActions: s.actions,
          replies: s.replies,
          closes: s.closes,
          escalations: s.escalations,
          escalationRate,
          avgResponseMin,
          avgCsat,
          reopens: s.reopens,
          avgCharCount,
          firstResponseRate,
        };
      })
      .sort((a, b) => b.score - a.score);

    // ---------------------------------------------------------------
    // 2. Per-agent response time trend (bucketed by ISO week)
    // ---------------------------------------------------------------

    // agentWeekMap: agent -> week -> times[]
    const agentWeekMap = new Map<string, Map<string, number[]>>();
    for (const r of trendRows) {
      if (!r.agent || r.agent === "system") continue;
      const displayName = r.agent.split("@")[0];
      if (!agentWeekMap.has(displayName))
        agentWeekMap.set(displayName, new Map());
      const weekMap = agentWeekMap.get(displayName)!;
      const week = isoWeek(r.occurredAt);
      if (!weekMap.has(week)) weekMap.set(week, []);
      weekMap.get(week)!.push(r.timeToRespondMin!);
    }

    // Collect all weeks in sorted order
    const allWeeks = Array.from(
      new Set(
        Array.from(agentWeekMap.values()).flatMap((wm) =>
          Array.from(wm.keys()),
        ),
      ),
    ).sort();

    const agentTrends = Array.from(agentWeekMap.entries())
      .map(([agent, weekMap]) => ({
        agent,
        weeks: allWeeks.map((week) => {
          const times = weekMap.get(week);
          return {
            week,
            avgResponseMin:
              times && times.length > 0
                ? Math.round(
                    (times.reduce((s, v) => s + v, 0) / times.length) * 10,
                  ) / 10
                : null,
          };
        }),
      }))
      .sort(
        (a, b) =>
          b.weeks.filter((w) => w.avgResponseMin !== null).length -
          a.weeks.filter((w) => w.avgResponseMin !== null).length,
      );

    // ---------------------------------------------------------------
    // 3. Per-agent category breakdown (top 5 categories)
    // ---------------------------------------------------------------

    const catCountMap = new Map<string, number>();
    const agentCatMap = new Map<string, Map<string, number>>();

    for (const r of categoryRows) {
      if (!r.agent || r.agent === "system" || !r.category) continue;
      catCountMap.set(r.category, (catCountMap.get(r.category) ?? 0) + 1);
      const displayName = r.agent.split("@")[0];
      if (!agentCatMap.has(displayName))
        agentCatMap.set(displayName, new Map());
      const cats = agentCatMap.get(displayName)!;
      cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
    }

    const top5Categories = Array.from(catCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    const agentCategories: { agent: string; category: string; count: number }[] =
      [];
    for (const [agent, cats] of agentCatMap) {
      for (const cat of top5Categories) {
        const count = cats.get(cat) ?? 0;
        if (count > 0) {
          agentCategories.push({ agent, category: cat, count });
        }
      }
    }

    // ---------------------------------------------------------------
    // 4. Workload by day (carry forward)
    // ---------------------------------------------------------------

    const dayAgentMap = new Map<string, Map<string, number>>();
    for (const b of workloadRows) {
      if (!b.agent || b.agent === "system") continue;
      const day = b.occurredAt.toISOString().split("T")[0];
      if (!dayAgentMap.has(day)) dayAgentMap.set(day, new Map());
      const agentCounts = dayAgentMap.get(day)!;
      const displayName = b.agent.split("@")[0];
      agentCounts.set(displayName, (agentCounts.get(displayName) ?? 0) + 1);
    }

    const workloadByDay = Array.from(dayAgentMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, agents]) => ({
        date,
        agents: Object.fromEntries(agents),
      }));

    // ---------------------------------------------------------------
    // 5. Macro effectiveness (carry forward + extensions)
    // ---------------------------------------------------------------

    // 5a. Macro stats (basic)
    const macroMap = new Map<
      string,
      { usageCount: number; responseTimes: number[] }
    >();
    for (const row of macroRows) {
      if (!row.macroName) continue;
      if (!macroMap.has(row.macroName)) {
        macroMap.set(row.macroName, { usageCount: 0, responseTimes: [] });
      }
      const m = macroMap.get(row.macroName)!;
      m.usageCount++;
      if (row.timeToRespondMin != null)
        m.responseTimes.push(row.timeToRespondMin);
    }

    const macros = Array.from(macroMap.entries())
      .map(([macroName, data]) => ({
        macroName,
        usageCount: data.usageCount,
        avgResolutionMin:
          data.responseTimes.length > 0
            ? Math.round(
                (data.responseTimes.reduce((s, v) => s + v, 0) /
                  data.responseTimes.length) *
                  10,
              ) / 10
            : null,
      }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);

    // 5b. macroVsNoMacro — per-category avg timing
    const withMacroMap = new Map<string, number[]>();
    for (const r of macroTimingRows) {
      if (!r.category) continue;
      if (!withMacroMap.has(r.category)) withMacroMap.set(r.category, []);
      withMacroMap.get(r.category)!.push(r.timeToRespondMin!);
    }

    const withoutMacroMap = new Map<string, number[]>();
    for (const r of noMacroTimingRows) {
      if (!r.category) continue;
      if (!withoutMacroMap.has(r.category))
        withoutMacroMap.set(r.category, []);
      withoutMacroMap.get(r.category)!.push(r.timeToRespondMin!);
    }

    const allTimingCategories = Array.from(
      new Set([
        ...Array.from(withMacroMap.keys()),
        ...Array.from(withoutMacroMap.keys()),
      ]),
    );

    const macroVsNoMacro = allTimingCategories
      .map((category) => {
        const withTimes = withMacroMap.get(category);
        const withoutTimes = withoutMacroMap.get(category);
        return {
          category,
          withMacroAvgMin:
            withTimes && withTimes.length > 0
              ? Math.round(
                  (withTimes.reduce((s, v) => s + v, 0) / withTimes.length) *
                    10,
                ) / 10
              : null,
          withoutMacroAvgMin:
            withoutTimes && withoutTimes.length > 0
              ? Math.round(
                  (withoutTimes.reduce((s, v) => s + v, 0) /
                    withoutTimes.length) *
                    10,
                ) / 10
              : null,
        };
      })
      .sort((a, b) => {
        const aTotal =
          (withMacroMap.get(a.category)?.length ?? 0) +
          (withoutMacroMap.get(a.category)?.length ?? 0);
        const bTotal =
          (withMacroMap.get(b.category)?.length ?? 0) +
          (withoutMacroMap.get(b.category)?.length ?? 0);
        return bTotal - aTotal;
      })
      .slice(0, 10);

    // 5c. agentMacroUsage — group by agent + macroName
    const agentMacroMap = new Map<string, number>();
    for (const row of macroRows) {
      if (!row.macroName || !row.agent || row.agent === "system") continue;
      const key = `${row.agent.split("@")[0]}|||${row.macroName}`;
      agentMacroMap.set(key, (agentMacroMap.get(key) ?? 0) + 1);
    }

    const agentMacroUsage = Array.from(agentMacroMap.entries())
      .map(([key, count]) => {
        const [agent, macroName] = key.split("|||");
        return { agent, macroName, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // ---------------------------------------------------------------
    // 6. Escalation patterns (agent + category)
    // ---------------------------------------------------------------

    const escMap = new Map<string, number>();
    for (const r of escalationRows) {
      if (!r.agent || r.agent === "system") continue;
      const cat = r.category ?? "uncategorized";
      const key = `${r.agent.split("@")[0]}|||${cat}`;
      escMap.set(key, (escMap.get(key) ?? 0) + 1);
    }

    const escalationPatterns = Array.from(escMap.entries())
      .map(([key, count]) => {
        const [agent, category] = key.split("|||");
        return { agent, category, count };
      })
      .sort((a, b) => b.count - a.count);

    // ---------------------------------------------------------------
    // 7. Response quality
    // ---------------------------------------------------------------

    const responseQuality = Array.from(agentMap.entries())
      .filter(([name]) => name !== "system")
      .map(([name, s]) => ({
        agent: name.split("@")[0],
        avgCharCount:
          s.charCounts.length > 0
            ? Math.round(
                s.charCounts.reduce((sum, v) => sum + v, 0) /
                  s.charCounts.length,
              )
            : null,
        firstResponseRate:
          s.firstResponseTotal > 0
            ? Math.round(
                (s.firstResponseYes / s.firstResponseTotal) * 10000,
              ) / 100
            : null,
      }));

    // ---------------------------------------------------------------
    // 8. Recent activity (carry forward)
    // ---------------------------------------------------------------

    const recentActivity = recentRows.map((r) => ({
      agent: r.agent.split("@")[0],
      action: r.action,
      ticketId: r.ticketId,
      ticketSubject: r.ticketSubject,
      occurredAt: r.occurredAt.toISOString(),
    }));

    return NextResponse.json({
      leaderboard,
      agentTrends,
      agentCategories,
      workloadByDay,
      macroEffectiveness: {
        macros,
        macroVsNoMacro,
        agentMacroUsage,
      },
      escalationPatterns,
      responseQuality,
      recentActivity,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/agent-intelligence] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 },
    );
  }
}
