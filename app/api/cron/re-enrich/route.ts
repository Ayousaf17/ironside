import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichBehaviorEntry } from "@/lib/gorgias/enrich";
import type { BehaviorLogEntry } from "@/lib/gorgias/events";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 60;

/**
 * Re-enriches agent behavior logs that were logged before enrichment was working.
 * Targets rows where message_position IS NULL (never enriched) and action = 'message'.
 * Fetches full ticket from Gorgias API and populates: macroIdUsed, macroName,
 * messagePosition, isFirstResponse, timeToRespondMin, responseCharCount.
 *
 * Rate-limited: processes 20 tickets per invocation with 1s delay between each.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.GORGIAS_MOCK !== "false") {
    return NextResponse.json({ ok: true, skipped: "mock_mode" });
  }

  try {
    // Find un-enriched message events (no message_position = never enriched)
    const rows = await prisma.agentBehaviorLog.findMany({
      where: {
        messagePosition: null,
        action: "message",
        agent: { not: "system" },
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, enriched: 0, message: "All agent messages already enriched" });
    }

    let enriched = 0;
    let errors = 0;
    const firstError: { msg?: string; ticket?: number } = {};

    for (const row of rows) {
      try {
        // Convert DB row to BehaviorLogEntry for enrichment
        const entry: BehaviorLogEntry = {
          agent: row.agent,
          action: row.action,
          ticketId: row.ticketId,
          ticketSubject: row.ticketSubject ?? undefined,
          category: row.category ?? undefined,
          responseText: row.responseText ?? undefined,
          tagsApplied: row.tagsApplied,
          occurredAt: row.occurredAt,
          agentEmail: row.agentEmail ?? undefined,
          ticketChannel: row.ticketChannel ?? undefined,
          ticketTags: row.ticketTags,
          reopened: row.reopened,
          rawEvent: (row.rawEvent as object) ?? {},
        };

        const enrichedEntry = await enrichBehaviorEntry(entry);

        // Update the DB row with enriched data
        await prisma.agentBehaviorLog.update({
          where: { id: row.id },
          data: {
            macroIdUsed: enrichedEntry.macroIdUsed ?? null,
            macroName: enrichedEntry.macroName ?? null,
            messagePosition: enrichedEntry.messagePosition ?? null,
            isFirstResponse: enrichedEntry.isFirstResponse ?? null,
            timeToRespondMin: enrichedEntry.timeToRespondMin ?? null,
            responseCharCount: enrichedEntry.responseCharCount ?? null,
            touchesToResolution: enrichedEntry.touchesToResolution ?? null,
            ticketChannel: enrichedEntry.ticketChannel ?? row.ticketChannel,
            ticketTags: (enrichedEntry.ticketTags ?? row.ticketTags).filter((t): t is string => t != null),
          },
        });

        enriched++;

        // Rate limit: 1 second between Gorgias API calls
        if (enriched < rows.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err) {
        errors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[re-enrich] Failed for ticket ${row.ticketId}:`, errMsg);
        // Include first error in response for debugging
        if (errors === 1) {
          (firstError as { msg: string; ticket: number }).msg = errMsg;
          (firstError as { msg: string; ticket: number }).ticket = row.ticketId;
        }
      }
    }

    const remaining = await prisma.agentBehaviorLog.count({
      where: { messagePosition: null, action: "message", agent: { not: "system" } },
    });

    console.log(`[re-enrich] Enriched ${enriched}/${rows.length}, ${errors} errors, ${remaining} remaining`);
    return NextResponse.json({ ok: true, enriched, errors, remaining, firstError: firstError.msg ? firstError : undefined });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/re-enrich] Error:", errorMessage);
    await logCronError({ metric: "cron_re_enrich_error", error: errorMessage });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
