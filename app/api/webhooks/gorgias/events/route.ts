// Gorgias Webhook Receiver — passively logs all agent behavior for AI training.
// n8n equivalent: Webhook Trigger → Switch node → DB Insert nodes.
//
// Gorgias sends POST requests here when ticket events occur.
// We parse each event into structured behavior logs and store them in Postgres.
//
// Setup in Gorgias: Settings → Webhooks → Add:
//   URL: https://ironside-alpha.vercel.app/api/webhooks/gorgias/events
//   Events: ticket-created, ticket-updated, ticket-message-created

import { NextResponse } from "next/server";
import { parseEvent, logBehaviorEntries } from "@/lib/gorgias/events";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const payload = await request.json();

    // Log the raw webhook for debugging
    const eventType = payload.event_type || payload.type || "unknown";
    console.log(`[gorgias-webhook] Received event: ${eventType} for ticket ${payload.ticket_id}`);

    // Parse the event — auto-detects HTTP Integration vs native webhook format
    const entries = parseEvent(payload);

    if (entries.length === 0) {
      // Event type we don't track (e.g., customer message) — acknowledge silently
      await prisma.apiLog.create({
        data: {
          endpoint: "/api/webhooks/gorgias/events",
          method: "POST",
          status: 200,
          request: { type: eventType, ticket_id: payload.ticket_id },
          response: { skipped: true, reason: "no_agent_action" },
          duration: Date.now() - startTime,
        },
      });
      return NextResponse.json({ ok: true, logged: 0 });
    }

    // Write behavior logs to database
    const count = await logBehaviorEntries(entries);

    // Log the API call
    await prisma.apiLog.create({
      data: {
        endpoint: "/api/webhooks/gorgias/events",
        method: "POST",
        status: 200,
        request: { type: eventType, ticket_id: payload.ticket_id },
        response: { logged: count, actions: entries.map(e => e.action) },
        duration: Date.now() - startTime,
      },
    });

    console.log(`[gorgias-webhook] Logged ${count} behavior entries for ticket ${payload.ticket_id}`);
    return NextResponse.json({ ok: true, logged: count });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[gorgias-webhook] Error:`, message);

    try {
      await prisma.apiLog.create({
        data: {
          endpoint: "/api/webhooks/gorgias/events",
          method: "POST",
          status: 500,
          error: message,
          duration: Date.now() - startTime,
        },
      });
    } catch {
      // Don't let logging failure mask the original error
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Gorgias sends a GET to verify the webhook URL exists
export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "ironside-behavior-logger",
    events_tracked: [
      "ticket-created",
      "ticket-updated",
      "ticket-message-created",
    ],
  });
}
