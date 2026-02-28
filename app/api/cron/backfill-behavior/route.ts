// Historical Backfill — imports past agent behavior from Gorgias Events API.
// n8n equivalent: HTTP Request node paginating through Gorgias events → DB Insert.
//
// Can be triggered manually (POST) or on a schedule (GET via Vercel cron).
// Processes events in pages, converts to behavior logs, writes to Postgres.
// Uses cursor-based pagination. Stores last cursor so it can resume.
//
// Manual trigger: curl -X POST https://ironside-alpha.vercel.app/api/cron/backfill-behavior
// With date range: curl -X POST -d '{"after":"2026-01-01","before":"2026-03-01"}' ...

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchEvents, type GorgiasEvent } from "@/lib/gorgias/read";
import { logBehaviorEntries, type BehaviorLogEntry } from "@/lib/gorgias/events";

export const maxDuration = 60;

const EVENT_TYPES = [
  "ticket-created",
  "ticket-updated",
  "ticket-message-created",
];

// Convert a Gorgias Events API event into a format parseGorgiasEvent can handle.
// The Events API shape differs slightly from webhook payloads.
function eventToBehaviorEntry(event: GorgiasEvent): BehaviorLogEntry | null {
  const agent = event.user?.email || "system";
  const occurredAt = new Date(event.created_datetime);
  const ticketId = event.object_type === "ticket" ? event.object_id : 0;
  if (!ticketId) return null;

  let action = "unknown";
  const changes = event.changes || {};

  if (event.type === "ticket-created") {
    action = "ticket_created";
  } else if (event.type === "ticket-message-created") {
    action = "reply"; // Events API doesn't distinguish reply vs internal_note easily
  } else if (event.type === "ticket-updated") {
    if (changes.status) {
      const to = changes.status.to as string;
      action = to === "closed" ? "close" : to === "open" ? "reopen" : "status_change";
    } else if (changes.assignee_user) {
      action = "assign";
    } else if (changes.tags) {
      action = "tag";
    } else {
      action = "update";
    }
  }

  return {
    gorgiasEventId: event.id,
    agent,
    action,
    ticketId,
    tagsApplied: [],
    reopened: action === "reopen",
    rawEvent: event as unknown as object,
    occurredAt,
  };
}

async function runBackfill(after?: string, before?: string, maxPages = 50): Promise<{ pages: number; logged: number; nextCursor?: string }> {
  let cursor: string | undefined;
  let totalLogged = 0;
  let pages = 0;

  for (let i = 0; i < maxPages; i++) {
    const result = await fetchEvents({
      types: EVENT_TYPES,
      limit: 100,
      cursor,
      created_after: after,
      created_before: before,
    });

    const entries: BehaviorLogEntry[] = [];
    for (const event of result.data) {
      const entry = eventToBehaviorEntry(event);
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      // Skip duplicates (gorgiasEventId is unique)
      for (const entry of entries) {
        try {
          await prisma.agentBehaviorLog.create({
            data: {
              gorgiasEventId: entry.gorgiasEventId,
              agent: entry.agent,
              action: entry.action,
              ticketId: entry.ticketId,
              ticketSubject: entry.ticketSubject,
              category: entry.category,
              responseText: entry.responseText,
              macroIdUsed: entry.macroIdUsed,
              tagsApplied: entry.tagsApplied,
              reopened: entry.reopened,
              rawEvent: entry.rawEvent as object,
              occurredAt: entry.occurredAt,
            },
          });
          totalLogged++;
        } catch (err: unknown) {
          // Unique constraint on gorgiasEventId — skip duplicates
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("Unique constraint")) continue;
          throw err;
        }
      }
    }

    pages++;
    cursor = result.meta?.next_cursor;
    if (!cursor || result.data.length === 0) break;
  }

  return { pages, logged: totalLogged, nextCursor: cursor };
}

// Manual trigger with optional date range
export async function POST(request: Request) {
  if (process.env.GORGIAS_MOCK !== "false") {
    return NextResponse.json({
      ok: false,
      error: "Backfill requires real Gorgias API (GORGIAS_MOCK=false)",
    }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runBackfill(body.after, body.before, body.max_pages);

    await prisma.apiLog.create({
      data: {
        endpoint: "/api/cron/backfill-behavior",
        method: "POST",
        status: 200,
        request: body,
        response: result,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backfill-behavior] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Cron trigger — fetches last 24h of events
export async function GET() {
  if (process.env.GORGIAS_MOCK !== "false") {
    return NextResponse.json({
      status: "skipped",
      reason: "Mock mode — backfill only runs with real Gorgias API",
    });
  }

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await runBackfill(yesterday, undefined, 20);

    await prisma.apiLog.create({
      data: {
        endpoint: "/api/cron/backfill-behavior",
        method: "GET",
        status: 200,
        response: result,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backfill-behavior] Cron error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
