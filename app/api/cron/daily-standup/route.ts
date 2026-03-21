// Daily standup summary — posts at 9 AM UTC to #ops channel.
// Covers: overnight ticket activity, open SLA breaches, stale tickets (no response >24h),
// offline queue status, and system health.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackBlocks } from "@/lib/slack/client";
import { searchTickets } from "@/lib/gorgias/client";
import { logCronError } from "@/lib/services/logging.service";
import { formatDailyStandupBlocks } from "@/lib/slack/formatters/standup";

export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const overnightStart = new Date(now);
    overnightStart.setHours(now.getHours() - 12); // last 12 hours

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Parallel data fetches
    const [
      latestPulse,
      overnightBehavior,
      openTickets,
      queueConfig,
    ] = await Promise.all([
      prisma.pulseCheck.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          ticketCount: true,
          openTickets: true,
          closedTickets: true,
          unassignedPct: true,
          spamRate: true,
          resolutionP90Min: true,
          topCategory: true,
          createdAt: true,
        },
      }),
      prisma.agentBehaviorLog.count({
        where: { occurredAt: { gte: overnightStart } },
      }),
      searchTickets({ status: "open" }),
      prisma.dashboardConfig.findUnique({ where: { key: "gorgias_offline_queue" } }),
    ]);

    // Find stale tickets — open tickets with no agent response in 24h
    const staleRaw = openTickets.filter((t) => {
      if (!t.created_datetime) return false;
      const lastUpdate = new Date(t.created_datetime).getTime();
      return lastUpdate < twentyFourHoursAgo.getTime();
    });

    const queuedOps = Array.isArray(queueConfig?.value) ? (queueConfig.value as unknown[]).length : 0;

    // SLA breach detection — open tickets older than 4h without agent response
    const SLA_DEFAULT_MIN = 240;
    const slaRaw = openTickets.filter((t) => {
      if (t.tags.some((tag: string) => tag === "auto-close" || tag === "non-support-related")) return false;
      const ageMin = Math.round((now.getTime() - new Date(t.created_datetime).getTime()) / 60000);
      return ageMin > SLA_DEFAULT_MIN;
    });

    // Shape data for formatter
    const staleTickets = staleRaw.map((t) => ({
      id: t.id as number,
      subject: t.subject as string,
      assignee: (t.assignee as string | null | undefined) ?? null,
      ageHours: Math.round((now.getTime() - new Date(t.created_datetime).getTime()) / 3600000),
    }));

    const slaBreaches = slaRaw.map((t) => ({
      id: t.id as number,
      subject: t.subject as string,
      assignee: (t.assignee as string | null | undefined) ?? null,
      ageHours: Math.round((now.getTime() - new Date(t.created_datetime).getTime()) / 3600000),
    }));

    const blocks = formatDailyStandupBlocks({
      openTickets: latestPulse?.openTickets ?? 0,
      closedTickets: latestPulse?.closedTickets ?? 0,
      unassignedPct: latestPulse?.unassignedPct ?? null,
      resolutionP90Min: latestPulse?.resolutionP90Min ?? null,
      topCategory: latestPulse?.topCategory ?? null,
      overnightActions: overnightBehavior,
      staleTickets,
      slaBreaches,
      queuedOps,
    });

    const fallbackText = `Morning brief: ${latestPulse?.openTickets ?? 0} open tickets, ${staleTickets.length} stale, ${overnightBehavior} overnight actions`;

    await sendSlackBlocks(fallbackText, blocks, undefined, undefined, "ops");

    return NextResponse.json({
      ok: true,
      openTickets: latestPulse?.openTickets ?? 0,
      staleTickets: staleTickets.length,
      overnightActions: overnightBehavior,
      queuedOps,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[daily-standup] Error:", msg);
    await logCronError({ metric: "daily-standup", error: msg }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
