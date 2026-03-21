import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    const [leaderboardRows, workloadRows, recentRows] = await Promise.all([
      // Leaderboard: last 30 days of behavior logs
      prisma.agentBehaviorLog.findMany({
        where: { occurredAt: { gte: thirtyDaysAgo } },
        select: {
          agent: true,
          action: true,
          timeToRespondMin: true,
          csatScore: true,
          reopened: true,
        },
      }),
      // Workload by day: last 14 days
      prisma.agentBehaviorLog.findMany({
        where: { occurredAt: { gte: fourteenDaysAgo } },
        select: {
          agent: true,
          occurredAt: true,
        },
      }),
      // Recent activity: last 50 entries
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

    // 1. Leaderboard
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
    }

    const leaderboard = Array.from(agentMap.entries())
      .map(([name, s]) => {
        const avgResponseMin =
          s.responseTimes.length > 0
            ? Math.round(
                (s.responseTimes.reduce((sum, v) => sum + v, 0) /
                  s.responseTimes.length) *
                  10
              ) / 10
            : null;
        const avgCsat =
          s.csatScores.length > 0
            ? Math.round(
                (s.csatScores.reduce((sum, v) => sum + v, 0) /
                  s.csatScores.length) *
                  10
              ) / 10
            : null;
        const escalationRate =
          s.actions > 0
            ? Math.round((s.escalations / s.actions) * 10000) / 100
            : 0;

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
        };
      })
      .sort((a, b) => b.score - a.score);

    // 2. Workload by day (last 14 days)
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

    // 3. Recent activity
    const recentActivity = recentRows.map((r) => ({
      agent: r.agent.split("@")[0],
      action: r.action,
      ticketId: r.ticketId,
      ticketSubject: r.ticketSubject,
      occurredAt: r.occurredAt.toISOString(),
    }));

    return NextResponse.json({ leaderboard, workloadByDay, recentActivity });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/team] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
