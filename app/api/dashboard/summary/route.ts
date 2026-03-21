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
    // 1. Parallel: fetch pulse data, queued ops, and open tickets from Gorgias
    const [pulseRows, queueConfig, gorgiasResult] = await Promise.all([
      prisma.pulseCheck.findMany({
        orderBy: { createdAt: "desc" },
        take: 30, // enough for trend + spike detection
      }),
      prisma.dashboardConfig.findUnique({
        where: { key: "gorgias_offline_queue" },
      }),
      fetchOpenTickets(),
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
    const { slaBreaches, staleTickets } = gorgiasResult;

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

    const summary: DashboardSummary = {
      system,
      alerts,
      metrics,
      resolutionTrend,
      categoryBreakdown,
      ticketFlow,
      opsNotes,
    };

    return NextResponse.json(summary);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[dashboard/summary] Error:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// --- Data fetchers ---

/** Fetch open tickets from Gorgias and compute SLA/stale counts. Falls back to zeros on failure. */
async function fetchOpenTickets(): Promise<{
  slaBreaches: number;
  staleTickets: number;
}> {
  try {
    const tickets = await searchTickets({ status: "open" });
    const now = Date.now();

    let slaBreaches = 0;
    let staleTickets = 0;

    for (const ticket of tickets) {
      // Skip spam / auto-close tickets
      if (isAutoClose(ticket.tags)) continue;

      const ageMs = now - new Date(ticket.created_datetime).getTime();
      const ageMin = ageMs / 60_000;

      if (ageMin > SLA_THRESHOLD_MIN) slaBreaches++;
      if (ageMs > STALE_THRESHOLD_MS) staleTickets++;
    }

    return { slaBreaches, staleTickets };
  } catch (err) {
    console.warn(
      "[dashboard/summary] Gorgias unreachable, SLA/stale counts defaulting to 0:",
      err instanceof Error ? err.message : String(err)
    );
    return { slaBreaches: 0, staleTickets: 0 };
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
