import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 30;

/**
 * Backfills TicketAnalytics.resolutionTimeMin from AgentBehaviorLog.timeToRespondMin.
 * Only updates rows where resolutionTimeMin is null and behavior data exists.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find ticket_analytics rows missing resolution time
    const missingRows = await prisma.ticketAnalytics.findMany({
      where: { resolutionTimeMin: null },
      select: { ticketId: true },
    });

    if (missingRows.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: "All rows have resolution times" });
    }

    const ticketIds = missingRows.map((r) => r.ticketId);

    // Get avg response time per ticket from behavior logs
    const behaviorData = await prisma.agentBehaviorLog.findMany({
      where: {
        ticketId: { in: ticketIds },
        timeToRespondMin: { not: null },
      },
      select: { ticketId: true, timeToRespondMin: true },
    });

    // Group by ticket, take the first (earliest) response time
    const ticketResolution = new Map<number, number>();
    for (const row of behaviorData) {
      if (row.timeToRespondMin == null) continue;
      if (!ticketResolution.has(row.ticketId)) {
        ticketResolution.set(row.ticketId, row.timeToRespondMin);
      } else {
        // Keep the minimum (fastest response time for this ticket)
        const current = ticketResolution.get(row.ticketId)!;
        if (row.timeToRespondMin < current) {
          ticketResolution.set(row.ticketId, row.timeToRespondMin);
        }
      }
    }

    let updated = 0;
    for (const [ticketId, resolutionMin] of ticketResolution) {
      await prisma.ticketAnalytics.update({
        where: { ticketId },
        data: { resolutionTimeMin: resolutionMin },
      });
      updated++;
    }

    console.log(`[cron/backfill-resolution-times] Updated ${updated} of ${missingRows.length} rows`);
    return NextResponse.json({ ok: true, updated, total: missingRows.length });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/backfill-resolution-times] Error:", errorMessage);
    await logCronError({ metric: "cron_backfill_resolution_error", error: errorMessage });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
