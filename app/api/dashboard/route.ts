import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTierReadiness } from "@/lib/analytics/tier-readiness";

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // No auth on dashboard — single-tenant internal tool.
  // For client-facing access control, use Vercel password protection
  // or Sign in with Vercel on the deployment.
  const tab = request.nextUrl.searchParams.get("tab") || "overview";

  try {
    switch (tab) {
      case "overview":
        return NextResponse.json(await getOverview());
      case "agents":
        return NextResponse.json(await getAgentPerformance());
      case "ai":
        return NextResponse.json(await getAiAnalytics());
      case "tiers":
        return NextResponse.json(await getTierStatus());
      case "pulse":
        return NextResponse.json(await getPulseChecks());
      case "behavior":
        return NextResponse.json(await getBehaviorLogs());
      case "feedback":
        return NextResponse.json(await getFeedbackLoop());
      case "reporting":
        return NextResponse.json(await getReportingData());
      default:
        return NextResponse.json(
          { error: `Unknown tab: ${tab}`, valid: ["overview", "agents", "ai", "tiers", "pulse", "behavior", "feedback", "reporting"] },
          { status: 400 }
        );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

async function getOverview() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const [
    totalBehaviorLogs,
    todayLogs,
    weekLogs,
    totalSessions,
    totalApiLogs,
    categoryBreakdown,
  ] = await Promise.all([
    prisma.agentBehaviorLog.count(),
    prisma.agentBehaviorLog.count({
      where: { occurredAt: { gte: todayStart } },
    }),
    prisma.agentBehaviorLog.count({
      where: { occurredAt: { gte: weekStart } },
    }),
    prisma.agentSession.count(),
    prisma.apiLog.count(),
    prisma.agentBehaviorLog.groupBy({
      by: ["action"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  return {
    tab: "overview",
    totalBehaviorLogs,
    todayLogs,
    weekLogs,
    totalSessions,
    totalApiLogs,
    actionBreakdown: categoryBreakdown.map((r) => ({
      action: r.action,
      count: r._count.id,
    })),
  };
}

async function getAgentPerformance() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [agentStats, recentActivity] = await Promise.all([
    prisma.agentBehaviorLog.groupBy({
      by: ["agent"],
      where: { occurredAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      _avg: { timeToRespondMin: true, responseCharCount: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.agentBehaviorLog.findMany({
      where: { occurredAt: { gte: thirtyDaysAgo } },
      select: {
        agent: true,
        action: true,
        ticketId: true,
        ticketSubject: true,
        category: true,
        timeToRespondMin: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    tab: "agents",
    period: "30d",
    agents: agentStats.map((r) => ({
      agent: r.agent,
      totalActions: r._count.id,
      avgResponseTimeMin: r._avg.timeToRespondMin
        ? Math.round(r._avg.timeToRespondMin * 10) / 10
        : null,
      avgResponseLength: r._avg.responseCharCount
        ? Math.round(r._avg.responseCharCount)
        : null,
    })),
    recentActivity,
  };
}

async function getAiAnalytics() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayUsage, monthUsage, sessionStats] = await Promise.all([
    prisma.aiTokenUsage.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { totalTokens: true, costUsd: true },
      _count: { id: true },
    }),
    prisma.aiTokenUsage.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { totalTokens: true, costUsd: true },
      _count: { id: true },
    }),
    prisma.agentSession.aggregate({
      _count: { id: true },
      _avg: { durationMs: true },
    }),
  ]);

  return {
    tab: "ai",
    today: {
      requests: todayUsage._count.id,
      totalTokens: todayUsage._sum.totalTokens || 0,
      costUsd: Math.round((todayUsage._sum.costUsd || 0) * 100) / 100,
    },
    month: {
      requests: monthUsage._count.id,
      totalTokens: monthUsage._sum.totalTokens || 0,
      costUsd: Math.round((monthUsage._sum.costUsd || 0) * 100) / 100,
    },
    sessions: {
      total: sessionStats._count.id,
      avgDurationMs: sessionStats._avg.durationMs
        ? Math.round(sessionStats._avg.durationMs)
        : null,
    },
  };
}

async function getTierStatus() {
  const [readiness, analyticsCount] = await Promise.all([
    getTierReadiness(),
    prisma.ticketAnalytics.count(),
  ]);

  return {
    tab: "tiers",
    totalTicketsAnalyzed: analyticsCount,
    categories: readiness.map((r) => ({
      category: r.category,
      tier: r.tier,
      ticketCount: r.ticketCount,
      accuracy: Math.round(r.accuracy * 1000) / 10,
      avgConfidence: Math.round(r.avgConfidence * 1000) / 10,
    })),
  };
}

async function getPulseChecks() {
  const rows = await prisma.pulseCheck.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return {
    tab: "pulse",
    data: rows.map((p) => ({
      id: p.id,
      created_at: p.createdAt.toISOString(),
      date_range_start: p.dateRangeStart?.toISOString().split("T")[0] ?? "",
      date_range_end: p.dateRangeEnd?.toISOString().split("T")[0] ?? "",
      ticket_count: p.ticketCount ?? 0,
      open_count: p.openTickets ?? 0,
      closed_count: p.closedTickets ?? 0,
      resolution_avg_min: p.avgResolutionMin ?? 0,
      resolution_p50_min: p.resolutionP50Min ?? 0,
      resolution_p90_min: p.resolutionP90Min ?? 0,
      tickets_analyzed: p.ticketsAnalyzed ?? 0,
      spam_pct: p.spamRate ?? 0,
      unassigned_pct: p.unassignedPct ?? 0,
      channel_email: p.channelEmail ?? 0,
      channel_chat: p.channelChat ?? 0,
      workload: (p.workload as Record<string, number>) ?? {},
      top_questions: (p.topQuestions as { question: string; count: number; ticket_ids: number[] }[]) ?? [],
      tags: (p.tags as Record<string, number>) ?? {},
      ops_notes: (p.opsNotes as string[]) ?? [],
    })),
  };
}

async function getBehaviorLogs() {
  const rows = await prisma.agentBehaviorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      createdAt: true,
      action: true,
      ticketId: true,
      ticketSubject: true,
      ticketChannel: true,
      category: true,
      ticketTags: true,
      agent: true,
      agentEmail: true,
      responseCharCount: true,
      macroIdUsed: true,
      macroName: true,
      messagePosition: true,
      timeToRespondMin: true,
      touchesToResolution: true,
      csatScore: true,
      occurredAt: true,
    },
  });

  return {
    tab: "behavior",
    data: rows.map((b) => ({
      id: b.id,
      created_at: b.createdAt.toISOString(),
      event_type: b.action,
      ticket_id: b.ticketId,
      ticket_subject: b.ticketSubject,
      ticket_channel: b.ticketChannel,
      ticket_category: b.category,
      ticket_tags: b.ticketTags,
      agent_name: b.agent,
      agent_email: b.agentEmail,
      response_char_count: b.responseCharCount,
      is_macro: b.macroIdUsed !== null,
      macro_name: b.macroName,
      message_position: b.messagePosition,
      time_to_first_response_min: b.timeToRespondMin,
      touches_to_resolution: b.touchesToResolution,
      csat_score: b.csatScore,
      resolved_at: b.occurredAt?.toISOString() ?? null,
    })),
  };
}

async function getFeedbackLoop() {
  const [allJudged, recentCorrections, correctionLogs] = await Promise.all([
    // All rows with a human judgement
    prisma.ticketAnalytics.findMany({
      where: { aiMatchesHuman: { not: null } },
      select: { aiMatchesHuman: true, aiClassification: true, humanClassification: true, updatedAt: true, ticketId: true },
      orderBy: { updatedAt: "desc" },
    }),
    // Recent mismatches
    prisma.ticketAnalytics.findMany({
      where: { aiMatchesHuman: false, humanClassification: { not: null }, aiClassification: { not: null } },
      select: { ticketId: true, aiClassification: true, humanClassification: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    // category_correction behavior log entries (have slackUserId in rawEvent)
    prisma.agentBehaviorLog.findMany({
      where: { action: "category_correction" },
      select: { agent: true, ticketId: true, occurredAt: true, rawEvent: true },
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
  ]);

  const totalJudged = allJudged.length;
  const totalCorrect = allJudged.filter((r) => r.aiMatchesHuman === true).length;
  const totalCorrected = allJudged.filter((r) => r.aiMatchesHuman === false).length;
  const overallAccuracy = totalJudged > 0 ? Math.round((totalCorrect / totalJudged) * 1000) / 10 : null;

  // Misclassification matrix: aiCategory → humanCategory → count
  const matrixMap = new Map<string, number>();
  for (const row of allJudged) {
    if (row.aiMatchesHuman === false && row.aiClassification && row.humanClassification) {
      const key = `${row.aiClassification}→${row.humanClassification}`;
      matrixMap.set(key, (matrixMap.get(key) ?? 0) + 1);
    }
  }
  const matrix = Array.from(matrixMap.entries())
    .map(([key, count]) => {
      const [aiCategory, humanCategory] = key.split("→");
      return { aiCategory, humanCategory, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Weekly accuracy trend (last 8 weeks)
  const weeklyMap = new Map<string, { correct: number; total: number }>();
  for (const row of allJudged) {
    const d = new Date(row.updatedAt);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(new Date(row.updatedAt).setDate(diff));
    const weekKey = monday.toISOString().split("T")[0];
    if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { correct: 0, total: 0 });
    weeklyMap.get(weekKey)!.total++;
    if (row.aiMatchesHuman) weeklyMap.get(weekKey)!.correct++;
  }
  const weeklyAccuracy = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, { correct, total }]) => ({
      week,
      accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : null,
      total,
      corrections: total - correct,
    }));

  // Classifier insights: pairs with >= 3 corrections are worth flagging
  const classifierInsights = matrix
    .filter((m) => m.count >= 3)
    .map((m) => ({
      aiCategory: m.aiCategory,
      humanCategory: m.humanCategory,
      count: m.count,
      suggestion: `AI routes "${m.aiCategory.replace(/_/g, " ")}" tickets that should be "${m.humanCategory.replace(/_/g, " ")}" — ${m.count} corrections logged. Update the ${m.humanCategory.replace(/_/g, " ")} regex pattern.`,
    }));

  // Build a map from ticketId to correcting agent name (from behavior logs)
  const correctorMap = new Map<number, string>();
  for (const log of correctionLogs) {
    if (!correctorMap.has(log.ticketId)) {
      // agent field is "slack:USERID" format
      const agentDisplay = log.agent.startsWith("slack:") ? `@${log.agent.slice(6)}` : log.agent;
      correctorMap.set(log.ticketId, agentDisplay);
    }
  }

  return {
    tab: "feedback",
    overallAccuracy,
    totalJudged,
    totalCorrect,
    totalCorrected,
    matrix,
    recentCorrections: recentCorrections.map((r) => ({
      ticketId: r.ticketId,
      aiCategory: r.aiClassification!,
      humanCategory: r.humanClassification!,
      correctedAt: r.updatedAt.toISOString(),
      correctedBy: correctorMap.get(r.ticketId) ?? null,
    })),
    weeklyAccuracy,
    classifierInsights,
  };
}

async function getReportingData() {
  const now = new Date();

  // Build week boundaries (last 8 weeks)
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

  // Monthly boundaries (last 3 months)
  const months: { start: Date; end: Date; label: string }[] = [];
  for (let i = 2; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    months.push({ start, end, label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }) });
  }

  // Fetch all data in parallel
  const eightWeeksAgo = weeks[0].start;
  const threeMonthsAgo = months[0].start;

  const [pulseRows, behaviorRows, tokenRows, feedbackRows] = await Promise.all([
    prisma.pulseCheck.findMany({
      where: { createdAt: { gte: eightWeeksAgo } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        ticketCount: true,
        openTickets: true,
        closedTickets: true,
        avgResolutionMin: true,
        resolutionP50Min: true,
        resolutionP90Min: true,
        spamRate: true,
        unassignedPct: true,
      },
    }),
    prisma.agentBehaviorLog.findMany({
      where: { occurredAt: { gte: eightWeeksAgo } },
      select: {
        agent: true,
        action: true,
        timeToRespondMin: true,
        occurredAt: true,
      },
    }),
    prisma.aiTokenUsage.aggregate({
      where: { createdAt: { gte: threeMonthsAgo } },
      _sum: { totalTokens: true, costUsd: true },
      _count: { id: true },
    }),
    prisma.ticketAnalytics.findMany({
      where: { aiMatchesHuman: { not: null }, updatedAt: { gte: eightWeeksAgo } },
      select: { aiMatchesHuman: true, updatedAt: true },
    }),
  ]);

  // Build weekly rollups
  const weeklyRollups = weeks.map((w) => {
    const pulses = pulseRows.filter((p) => p.createdAt >= w.start && p.createdAt <= w.end);
    const behaviors = behaviorRows.filter((b) => b.occurredAt && b.occurredAt >= w.start && b.occurredAt <= w.end);
    const feedback = feedbackRows.filter((f) => f.updatedAt >= w.start && f.updatedAt <= w.end);

    const totalTickets = pulses.reduce((s, p) => s + (p.ticketCount ?? 0), 0);
    const avgResolution = pulses.length > 0
      ? Math.round(pulses.reduce((s, p) => s + (p.avgResolutionMin ?? 0), 0) / pulses.length)
      : null;
    const avgP90 = pulses.length > 0
      ? Math.round(pulses.reduce((s, p) => s + (p.resolutionP90Min ?? 0), 0) / pulses.length)
      : null;
    const avgSpam = pulses.length > 0
      ? Math.round(pulses.reduce((s, p) => s + (p.spamRate ?? 0), 0) / pulses.length * 10) / 10
      : null;

    // Agent breakdown
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
      totalTickets,
      avgResolutionMin: avgResolution,
      p90Min: avgP90,
      spamPct: avgSpam,
      agentActions: behaviors.length,
      agentBreakdown,
      aiAccuracy: fbTotal > 0 ? Math.round((fbCorrect / fbTotal) * 1000) / 10 : null,
      aiJudged: fbTotal,
    };
  });

  // Monthly summary
  const monthlySummary = months.map((m) => {
    const pulses = pulseRows.filter((p) => p.createdAt >= m.start && p.createdAt <= m.end);
    const behaviors = behaviorRows.filter((b) => b.occurredAt && b.occurredAt >= m.start && b.occurredAt <= m.end);

    return {
      month: m.label,
      totalTickets: pulses.reduce((s, p) => s + (p.ticketCount ?? 0), 0),
      avgResolutionMin: pulses.length > 0
        ? Math.round(pulses.reduce((s, p) => s + (p.avgResolutionMin ?? 0), 0) / pulses.length)
        : null,
      totalAgentActions: behaviors.length,
      pulseChecks: pulses.length,
    };
  });

  return {
    tab: "reporting",
    weeklyRollups,
    monthlySummary,
    aiCosts: {
      totalRequests: tokenRows._count.id,
      totalTokens: tokenRows._sum.totalTokens ?? 0,
      totalCostUsd: Math.round((tokenRows._sum.costUsd ?? 0) * 100) / 100,
    },
  };
}
