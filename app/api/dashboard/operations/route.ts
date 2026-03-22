import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchTickets } from "@/lib/gorgias/client";

export const maxDuration = 30;

// --- Types ---

interface VolumeSpike {
  detected: boolean;
  multiplier: number;
  currentVolume: number;
  avgVolume: number;
}

interface TicketDetail {
  id: number;
  subject: string;
  assignee: string;
  ageHours: number;
}

interface CategoryP90 {
  category: string;
  p90Min: number;
  ticketCount: number;
}

interface DashboardSummary {
  system: {
    status: "healthy" | "degraded" | "down";
    lastPulse: string | null;
    queuedOps: number;
  };
  alerts: {
    slaBreaches: number;
    staleTickets: number;
    volumeSpike: VolumeSpike | null;
  };
  metrics: {
    openTickets: number;
    openDelta: number;
    responseP90Min: number;
    responseP90Delta: number;
    spamPct: number;
    spamDelta: number;
    unassignedPct: number;
    unassignedDelta: number;
    slaCompliancePct: number;
    slaDelta: number;
  };
  resolutionTrend: { date: string; p50: number; p90: number }[];
  categoryBreakdown: { name: string; count: number }[];
  ticketFlow: { open: number; assigned: number; closed: number; spam: number };
  opsNotes: string[];
  slaBreachTickets: TicketDetail[];
  staleTicketsList: TicketDetail[];
  categoryP90: CategoryP90[];
}

// --- Helpers ---

const SLA_THRESHOLD_MIN = 240; // 4 hours
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_CLOSE_TAGS = ["auto-close", "non-support-related"];

function isAutoClose(tags: string[]): boolean {
  return tags.some((t) => AUTO_CLOSE_TAGS.includes(t));
}

// --- Route ---

export async function GET() {
  try {
    // 1. Parallel: fetch pulse data, queued ops, open tickets, and category P90
    const [pulseRows, queueConfig, gorgiasResult, categoryP90] = await Promise.all([
      prisma.pulseCheck.findMany({
        orderBy: { createdAt: "desc" },
        take: 30, // enough for trend + spike detection
      }),
      prisma.dashboardConfig.findUnique({
        where: { key: "gorgias_offline_queue" },
      }),
      fetchOpenTickets(),
      fetchCategoryP90(),
    ]);

    const latest = pulseRows[0] ?? null;
    const previous = pulseRows[1] ?? null;

    // --- system ---
    const system = {
      status: "healthy" as const,
      lastPulse: latest?.createdAt.toISOString() ?? null,
      queuedOps: countQueuedOps(queueConfig?.value),
    };

    // --- alerts ---
    const { slaBreaches, staleTickets, slaBreachTickets, staleTicketsList } = gorgiasResult;

    const volumeSpike = computeVolumeSpike(pulseRows);

    const alerts = { slaBreaches, staleTickets, volumeSpike };

    // --- metrics ---
    const openTickets = latest?.openTickets ?? 0;
    const prevOpen = previous?.openTickets ?? 0;
    const p90 = latest?.resolutionP90Min ?? 0;
    const prevP90 = previous?.resolutionP90Min ?? 0;
    const spam = latest?.spamRate ?? 0;
    const prevSpam = previous?.spamRate ?? 0;
    const unassigned = latest?.unassignedPct ?? 0;
    const prevUnassigned = previous?.unassignedPct ?? 0;

    const slaCompliancePct =
      openTickets > 0
        ? Math.round(((openTickets - slaBreaches) / openTickets) * 1000) / 10
        : 100;
    const prevSlaCompliance =
      prevOpen > 0
        ? Math.round(((prevOpen - 0) / prevOpen) * 1000) / 10 // previous SLA breaches unknown, use 100%
        : 100;

    const metrics = {
      openTickets,
      openDelta: openTickets - prevOpen,
      responseP90Min: Math.round(p90 * 10) / 10,
      responseP90Delta: Math.round((p90 - prevP90) * 10) / 10,
      spamPct: Math.round(spam * 10) / 10,
      spamDelta: Math.round((spam - prevSpam) * 10) / 10,
      unassignedPct: Math.round(unassigned * 10) / 10,
      unassignedDelta: Math.round((unassigned - prevUnassigned) * 10) / 10,
      slaCompliancePct,
      slaDelta: Math.round((slaCompliancePct - prevSlaCompliance) * 10) / 10,
    };

    // --- resolutionTrend (last 30 pulses, oldest first) ---
    const resolutionTrend = [...pulseRows]
      .reverse()
      .map((p) => ({
        date: p.createdAt.toISOString(),
        p50: p.resolutionP50Min ?? 0,
        p90: p.resolutionP90Min ?? 0,
      }));

    // --- categoryBreakdown ---
    const topQuestions =
      (latest?.topQuestions as { question: string; count: number }[] | null) ??
      [];
    const categoryBreakdown = topQuestions.map((q) => ({
      name: q.question,
      count: q.count,
    }));

    // --- ticketFlow ---
    const ticketCount = latest?.ticketCount ?? 0;
    const closedTickets = latest?.closedTickets ?? 0;
    const spamCount = Math.round((ticketCount * spam) / 100);
    const assignedCount = Math.round(
      openTickets - (unassigned * openTickets) / 100
    );

    const ticketFlow = {
      open: openTickets,
      assigned: Math.max(0, assignedCount),
      closed: closedTickets,
      spam: spamCount,
    };

    // --- opsNotes ---
    const opsNotes = (latest?.opsNotes as string[] | null) ?? [];

    // --- Morning Brief ---
    const briefParts: string[] = [];

    // Queue state
    briefParts.push(`${openTickets} open ticket${openTickets !== 1 ? "s" : ""}`);
    if (metrics.unassignedPct > 50) {
      briefParts[0] += ` (${Math.round(metrics.unassignedPct)}% unassigned — needs attention)`;
    }

    // SLA
    if (slaBreaches > 0) {
      briefParts.push(`${slaBreaches} SLA breach${slaBreaches !== 1 ? "es" : ""}`);
    }

    // Stale
    if (staleTickets > 0) {
      briefParts.push(`${staleTickets} stale ticket${staleTickets !== 1 ? "s" : ""} (no response >24h)`);
    }

    // Volume spike
    if (volumeSpike?.detected) {
      briefParts.push(`Volume spike: ${volumeSpike.multiplier}x normal`);
    }

    // P90
    if (p90 > 0) {
      briefParts.push(`P90 response: ${Math.round(p90)}min`);
    }

    // Spam
    if (spam > 30) {
      briefParts.push(`Spam rate high at ${Math.round(spam)}%`);
    }

    // Token cost (last 24h)
    let dailyCostLine: string | null = null;
    try {
      const oneDayAgo = new Date(Date.now() - 86400000);
      const dailyCost = await prisma.aiTokenUsage.aggregate({
        where: { createdAt: { gte: oneDayAgo } },
        _sum: { costUsd: true },
      });
      const cost = dailyCost._sum.costUsd ?? 0;
      if (cost > 0) {
        dailyCostLine = `$${cost.toFixed(2)} LLM spend yesterday`;
      }
    } catch { /* non-critical */ }
    if (dailyCostLine) briefParts.push(dailyCostLine);

    // Tier progress
    let tierLine: string | null = null;
    try {
      const tierCounts = await prisma.ticketAnalytics.groupBy({
        by: ["category"],
        where: { aiMatchesHuman: { not: null } },
        _count: true,
      });
      const totalCategories = tierCounts.length;
      if (totalCategories > 0) {
        tierLine = `${totalCategories} categories tracked for tier progression`;
      }
    } catch { /* non-critical */ }
    if (tierLine) briefParts.push(tierLine);

    const morningBrief = briefParts.join(". ") + ".";

    const summary = {
      system,
      alerts,
      metrics,
      resolutionTrend,
      categoryBreakdown,
      ticketFlow,
      opsNotes,
      slaBreachTickets,
      staleTicketsList,
      categoryP90,
      morningBrief,
    };

    return NextResponse.json(summary);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/operations] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// --- Data fetchers ---

/** Fetch open tickets from Gorgias with a 5s timeout. Falls back to zeros on timeout/failure. */
async function fetchOpenTickets(): Promise<{
  slaBreaches: number;
  staleTickets: number;
  slaBreachTickets: TicketDetail[];
  staleTicketsList: TicketDetail[];
}> {
  try {
    const tickets = await Promise.race([
      searchTickets({ status: "open" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gorgias timeout (5s)")), 5000)
      ),
    ]);
    const now = Date.now();

    let slaBreaches = 0;
    let staleTickets = 0;
    const slaBreachTickets: TicketDetail[] = [];
    const staleTicketsList: TicketDetail[] = [];

    for (const ticket of tickets) {
      if (isAutoClose(ticket.tags)) continue;
      const ageMs = now - new Date(ticket.created_datetime).getTime();
      const ageHours = Math.round(ageMs / 3_600_000 * 10) / 10;

      if (ageMs / 60_000 > SLA_THRESHOLD_MIN) {
        slaBreaches++;
        if (slaBreachTickets.length < 10) {
          slaBreachTickets.push({
            id: ticket.id,
            subject: ticket.subject,
            assignee: ticket.assignee ?? "Unassigned",
            ageHours,
          });
        }
      }
      if (ageMs > STALE_THRESHOLD_MS) {
        staleTickets++;
        if (staleTicketsList.length < 10) {
          staleTicketsList.push({
            id: ticket.id,
            subject: ticket.subject,
            assignee: ticket.assignee ?? "Unassigned",
            ageHours,
          });
        }
      }
    }

    return { slaBreaches, staleTickets, slaBreachTickets, staleTicketsList };
  } catch (err) {
    console.warn(
      "[dashboard/operations] Gorgias unavailable, SLA/stale defaulting to 0:",
      err instanceof Error ? err.message : String(err)
    );
    return { slaBreaches: 0, staleTickets: 0, slaBreachTickets: [], staleTicketsList: [] };
  }
}

/** Compute P90 response time per category from AgentBehaviorLog. */
async function fetchCategoryP90(): Promise<CategoryP90[]> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const rows = await prisma.agentBehaviorLog.findMany({
      where: {
        occurredAt: { gte: thirtyDaysAgo },
        category: { not: null },
        timeToRespondMin: { not: null },
      },
      select: { category: true, timeToRespondMin: true },
    });

    const byCategory = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.category || row.timeToRespondMin == null) continue;
      if (!byCategory.has(row.category)) byCategory.set(row.category, []);
      byCategory.get(row.category)!.push(row.timeToRespondMin);
    }

    return Array.from(byCategory.entries())
      .map(([category, times]) => {
        const sorted = times.sort((a, b) => a - b);
        const p90Index = Math.floor(sorted.length * 0.9);
        const p90Min = Math.round(sorted[Math.min(p90Index, sorted.length - 1)] * 10) / 10;
        return { category, p90Min, ticketCount: sorted.length };
      })
      .sort((a, b) => b.p90Min - a.p90Min)
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** Parse the offline queue config value and count entries. */
function countQueuedOps(value: unknown): number {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  return 0;
}

/** Compare latest pulse ticketCount to average of previous 7 pulses. */
function computeVolumeSpike(
  pulses: { ticketCount: number | null }[]
): VolumeSpike | null {
  if (pulses.length < 2) return null;

  const current = pulses[0].ticketCount ?? 0;
  const previous7 = pulses.slice(1, 8);
  if (previous7.length === 0) return null;

  const avg =
    previous7.reduce((s, p) => s + (p.ticketCount ?? 0), 0) / previous7.length;
  if (avg <= 0) return null;

  const multiplier = Math.round((current / avg) * 10) / 10;

  return {
    detected: multiplier >= 2,
    multiplier,
    currentVolume: current,
    avgVolume: Math.round(avg),
  };
}
