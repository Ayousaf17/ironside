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
      case "behavior": {
        const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 200, 500);
        const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;
        return NextResponse.json(await getBehaviorLogs(limit, offset));
      }
      case "feedback":
        return NextResponse.json(await getFeedbackLoop());
      case "reporting":
        return NextResponse.json(await getReportingData());
      case "trends":
        return NextResponse.json(await getTrends());
      case "analytics":
        return NextResponse.json(await getAdvancedAnalytics());
      default:
        return NextResponse.json(
          { error: `Unknown tab: ${tab}`, valid: ["overview", "agents", "ai", "tiers", "pulse", "behavior", "feedback", "reporting", "trends", "analytics"] },
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

async function getBehaviorLogs(limit = 200, offset = 0) {
  const [rows, total] = await Promise.all([
    prisma.agentBehaviorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
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
  }),
    prisma.agentBehaviorLog.count(),
  ]);

  return {
    tab: "behavior",
    total,
    limit,
    offset,
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

// --- Trends (Sprint 10) ---

async function getTrends() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [pulseRows, behaviorRows, sentimentRows] = await Promise.all([
    prisma.pulseCheck.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        ticketCount: true,
        openTickets: true,
        closedTickets: true,
        spamRate: true,
        unassignedPct: true,
        resolutionP50Min: true,
        resolutionP90Min: true,
        topQuestions: true,
      },
    }),
    prisma.agentBehaviorLog.findMany({
      where: { occurredAt: { gte: thirtyDaysAgo } },
      select: {
        agent: true,
        action: true,
        timeToRespondMin: true,
        occurredAt: true,
      },
    }),
    prisma.agentBehaviorLog.findMany({
      where: {
        occurredAt: { gte: thirtyDaysAgo },
        action: "auto_triage",
      },
      select: { rawEvent: true, occurredAt: true },
    }),
  ]);

  // 1. Daily volume trend
  const dailyVolume = pulseRows.map((p) => ({
    date: p.createdAt.toISOString().split("T")[0],
    tickets: p.ticketCount ?? 0,
    open: p.openTickets ?? 0,
    closed: p.closedTickets ?? 0,
    spamPct: p.spamRate ?? 0,
    unassignedPct: p.unassignedPct ?? 0,
    p50Min: p.resolutionP50Min ?? 0,
    p90Min: p.resolutionP90Min ?? 0,
  }));

  // 2. Category breakdown over time
  const categoryByDay = new Map<string, Map<string, number>>();
  for (const p of pulseRows) {
    const day = p.createdAt.toISOString().split("T")[0];
    const questions = (p.topQuestions as { question: string; count: number }[]) ?? [];
    if (!categoryByDay.has(day)) categoryByDay.set(day, new Map());
    const dayMap = categoryByDay.get(day)!;
    for (const q of questions) {
      dayMap.set(q.question, (dayMap.get(q.question) ?? 0) + q.count);
    }
  }
  const categoryTrend = Array.from(categoryByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cats]) => ({ date, categories: Object.fromEntries(cats) }));

  // 3. Agent performance scores
  const agentMap = new Map<string, { actions: number; replies: number; escalations: number; responseTimes: number[] }>();
  for (const b of behaviorRows) {
    if (!b.agent) continue;
    if (!agentMap.has(b.agent)) agentMap.set(b.agent, { actions: 0, replies: 0, escalations: 0, responseTimes: [] });
    const a = agentMap.get(b.agent)!;
    a.actions++;
    if (b.action === "reply" || b.action === "reply_ticket") a.replies++;
    if (b.action === "escalation") a.escalations++;
    if (b.timeToRespondMin != null) a.responseTimes.push(b.timeToRespondMin);
  }
  const agentScores = Array.from(agentMap.entries())
    .filter(([name]) => name !== "system")
    .map(([name, stats]) => {
      const avgResponseMin = stats.responseTimes.length > 0
        ? Math.round(stats.responseTimes.reduce((s, v) => s + v, 0) / stats.responseTimes.length * 10) / 10
        : null;
      const escalationRate = stats.actions > 0 ? Math.round((stats.escalations / stats.actions) * 1000) / 10 : 0;
      return {
        agent: name.split("@")[0],
        totalActions: stats.actions,
        replies: stats.replies,
        escalations: stats.escalations,
        escalationRate,
        avgResponseMin,
      };
    })
    .sort((a, b) => b.totalActions - a.totalActions);

  // 4. Sentiment trend
  const sentimentByDay = new Map<string, { angry: number; frustrated: number; happy: number; neutral: number }>();
  for (const s of sentimentRows) {
    const day = s.occurredAt.toISOString().split("T")[0];
    if (!sentimentByDay.has(day)) sentimentByDay.set(day, { angry: 0, frustrated: 0, happy: 0, neutral: 0 });
    const raw = s.rawEvent as Record<string, unknown> | null;
    const sentiment = (raw?.sentiment as string) ?? "neutral";
    const dayData = sentimentByDay.get(day)!;
    if (sentiment in dayData) dayData[sentiment as keyof typeof dayData]++;
  }
  const sentimentTrend = Array.from(sentimentByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  // 5. Volume spike detection
  let spikeAlert: { detected: boolean; currentVolume: number; avgVolume: number; multiplier: number } | null = null;
  if (dailyVolume.length >= 2) {
    const recent7 = dailyVolume.slice(-8, -1);
    const today = dailyVolume[dailyVolume.length - 1];
    if (recent7.length > 0 && today) {
      const avg = Math.round(recent7.reduce((s, d) => s + d.tickets, 0) / recent7.length);
      if (avg > 0) {
        const multiplier = Math.round((today.tickets / avg) * 10) / 10;
        spikeAlert = { detected: multiplier >= 2, currentVolume: today.tickets, avgVolume: avg, multiplier };
      }
    }
  }

  return { tab: "trends", dailyVolume, categoryTrend, agentScores, sentimentTrend, spikeAlert };
}

// --- Advanced Analytics (Sprint 13) ---

async function getAdvancedAnalytics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [behaviorRows, tokenUsage, pulseRows, ticketAnalytics] = await Promise.all([
    prisma.agentBehaviorLog.findMany({
      where: { occurredAt: { gte: thirtyDaysAgo } },
      select: {
        agent: true,
        action: true,
        timeToRespondMin: true,
        touchesToResolution: true,
        csatScore: true,
        reopened: true,
        category: true,
      },
    }),
    prisma.aiTokenUsage.aggregate({
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { costUsd: true, totalTokens: true },
      _count: { id: true },
    }),
    prisma.pulseCheck.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { ticketCount: true },
    }),
    prisma.ticketAnalytics.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: {
        resolutionTimeMin: true,
        costSavingsUsd: true,
        aiMatchesHuman: true,
        touchCount: true,
        wasReopened: true,
      },
    }),
  ]);

  // 1. Agent leaderboard
  const agentMap = new Map<string, {
    actions: number; replies: number; closes: number; escalations: number;
    responseTimes: number[]; csatScores: number[]; reopens: number;
  }>();
  for (const b of behaviorRows) {
    if (!b.agent || b.agent === "system") continue;
    if (!agentMap.has(b.agent)) {
      agentMap.set(b.agent, { actions: 0, replies: 0, closes: 0, escalations: 0, responseTimes: [], csatScores: [], reopens: 0 });
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
      const avgResponse = s.responseTimes.length > 0
        ? Math.round(s.responseTimes.reduce((sum, v) => sum + v, 0) / s.responseTimes.length * 10) / 10
        : null;
      const avgCsat = s.csatScores.length > 0
        ? Math.round(s.csatScores.reduce((sum, v) => sum + v, 0) / s.csatScores.length * 10) / 10
        : null;
      // Score: weighted composite (lower response = better, higher CSAT = better, lower escalation = better)
      let score = 50; // base
      if (avgResponse != null) score += Math.max(0, 30 - avgResponse); // faster = more points (up to 30)
      if (avgCsat != null) score += avgCsat * 4; // CSAT 1-5 → up to 20 points
      if (s.actions > 0) score -= (s.escalations / s.actions) * 20; // escalation penalty
      return {
        agent: name.split("@")[0],
        totalActions: s.actions,
        replies: s.replies,
        closes: s.closes,
        escalations: s.escalations,
        reopens: s.reopens,
        avgResponseMin: avgResponse,
        avgCsat,
        score: Math.round(score),
      };
    })
    .sort((a, b) => b.score - a.score);

  // 2. Cost per ticket
  const totalTickets = pulseRows.reduce((s, p) => s + (p.ticketCount ?? 0), 0);
  const totalLlmCost = tokenUsage._sum.costUsd ?? 0;
  const costPerTicket = totalTickets > 0 ? Math.round((totalLlmCost / totalTickets) * 100) / 100 : null;

  // 3. Time-saved estimation
  // Assumption: manual response takes ~15 min avg, AI-assisted takes actual avg
  const MANUAL_AVG_MIN = 15;
  const aiAssistedTimes = ticketAnalytics
    .filter((t) => t.resolutionTimeMin != null)
    .map((t) => t.resolutionTimeMin!);
  const avgAiAssistedMin = aiAssistedTimes.length > 0
    ? Math.round(aiAssistedTimes.reduce((s, v) => s + v, 0) / aiAssistedTimes.length * 10) / 10
    : null;
  const timeSavedPerTicketMin = avgAiAssistedMin != null ? Math.max(0, MANUAL_AVG_MIN - avgAiAssistedMin) : null;
  const totalTimeSavedHours = timeSavedPerTicketMin != null && totalTickets > 0
    ? Math.round((timeSavedPerTicketMin * totalTickets) / 60 * 10) / 10
    : null;

  // Cumulative cost savings from TicketAnalytics
  const totalCostSavings = ticketAnalytics
    .filter((t) => t.costSavingsUsd != null)
    .reduce((s, t) => s + (t.costSavingsUsd ?? 0), 0);

  // AI accuracy summary
  const judged = ticketAnalytics.filter((t) => t.aiMatchesHuman != null);
  const accurate = judged.filter((t) => t.aiMatchesHuman === true);
  const accuracy = judged.length > 0 ? Math.round((accurate.length / judged.length) * 1000) / 10 : null;

  return {
    tab: "analytics",
    period: "30d",
    leaderboard,
    costAnalysis: {
      totalLlmCost: Math.round(totalLlmCost * 100) / 100,
      totalTokens: tokenUsage._sum.totalTokens ?? 0,
      totalRequests: tokenUsage._count.id,
      totalTickets,
      costPerTicket,
    },
    timeSaved: {
      manualAvgMin: MANUAL_AVG_MIN,
      aiAssistedAvgMin: avgAiAssistedMin,
      savedPerTicketMin: timeSavedPerTicketMin,
      totalSavedHours: totalTimeSavedHours,
      totalTickets,
    },
    costSavings: {
      totalUsd: Math.round(totalCostSavings * 100) / 100,
      ticketsAnalyzed: ticketAnalytics.length,
    },
    aiAccuracy: {
      accuracy,
      judged: judged.length,
      correct: accurate.length,
    },
  };
}
