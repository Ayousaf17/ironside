// Gorgias Webhook Receiver — passively logs all agent behavior for AI training.
// n8n equivalent: Webhook Trigger → Switch node → DB Insert nodes.
//
// Gorgias sends POST requests here when ticket events occur.
// We parse each event into structured behavior logs and store them in Postgres.
//
// Setup in Gorgias: Settings → Webhooks → Add:
//   URL: https://ironside-alpha.vercel.app/api/webhooks/gorgias/events
//   Events: ticket-created, ticket-updated, ticket-message-created
//   Secret Token: set GORGIAS_WEBHOOK_SECRET in Vercel env vars (Settings → Integrations → Webhooks)

import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { parseEvent } from "@/lib/gorgias/events";
import { enrichBehaviorEntry } from "@/lib/gorgias/enrich";
import { logBehaviorEntries } from "@/lib/services/behavior.service";
import { logApiCall, logApiError } from "@/lib/services/logging.service";
import { handleNewTicketAlert } from "@/lib/slack/handlers/urgent-alert";
import { handleAutoTriage } from "@/lib/slack/handlers/auto-triage";
import { notifyDeadLetter } from "@/lib/slack/handlers/dead-letter";
import { isDuplicate, markSeen, webhookKey } from "@/lib/services/idempotency.service";
import type { GorgiasHttpIntegrationPayload } from "@/lib/gorgias/events";

export const maxDuration = 30;

// Gorgias HTTP Integration does not support HMAC — we use a shared secret token instead.
// Configure each HTTP Integration in Gorgias to send: X-Webhook-Secret: <GORGIAS_WEBHOOK_SECRET>
// If GORGIAS_WEBHOOK_SECRET is not set, verification is skipped (allows gradual rollout).
function verifyGorgiasSignature(_rawBody: string, request: Request): boolean {
  const secret = process.env.GORGIAS_WEBHOOK_SECRET;
  if (!secret) return true;

  const token = request.headers.get("x-webhook-secret");
  if (!token) return false;

  try {
    const expected = Buffer.from(secret);
    const received = Buffer.from(token);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let eventType = "unknown";
  let ticketId: string | number = "unknown";

  try {
    const rawBody = await request.text();

    if (!verifyGorgiasSignature(rawBody, request)) {
      console.warn("[gorgias-webhook] Signature verification failed — rejecting request");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    // Log the raw webhook for debugging
    eventType = String(payload.event_type ?? payload.type ?? "unknown");
    ticketId = payload.ticket_id ? String(payload.ticket_id) : "unknown";
    console.log(`[gorgias-webhook] Received event: ${eventType} for ticket ${ticketId}`);

    // Parse the event — auto-detects HTTP Integration vs native webhook format
    let entries = parseEvent(payload);

    if (entries.length === 0) {
      // Event type we don't track (e.g., customer message) — acknowledge silently
      await logApiCall({
        endpoint: "/api/webhooks/gorgias/events",
        method: "POST",
        status: 200,
        request: { type: eventType, ticket_id: payload.ticket_id },
        response: { skipped: true, reason: "no_agent_action" },
        duration: Date.now() - startTime,
        ticketId: payload.ticket_id ? Number(payload.ticket_id) : undefined,
        intent: eventType,
      });
      return NextResponse.json({ ok: true, logged: 0 });
    }

    // Dedup: Gorgias retries on slow/failed responses — skip duplicate agent events within 10 min
    const idempotencyKey = webhookKey(eventType, String(ticketId));
    if (isDuplicate(idempotencyKey)) {
      console.log(`[gorgias-webhook] Duplicate event skipped: ${idempotencyKey}`);
      return NextResponse.json({ ok: true, skipped: true });
    }
    markSeen(idempotencyKey);

    // Enrich entries with full ticket data from Gorgias API (graceful degradation)
    if (process.env.GORGIAS_MOCK === "false") {
      try {
        entries = await Promise.all(entries.map(e => enrichBehaviorEntry(e)));
      } catch (enrichErr) {
        console.warn("[gorgias-webhook] Enrichment failed, logging raw entries:", enrichErr);
      }
    }

    // Write behavior logs to database
    const count = await logBehaviorEntries(entries);

    // Log the API call
    await logApiCall({
      endpoint: "/api/webhooks/gorgias/events",
      method: "POST",
      status: 200,
      request: { type: eventType, ticket_id: payload.ticket_id },
      response: { logged: count, actions: entries.map(e => e.action) },
      duration: Date.now() - startTime,
      ticketId: payload.ticket_id ? Number(payload.ticket_id) : undefined,
      intent: eventType,
    });

    console.log(`[gorgias-webhook] Logged ${count} behavior entries for ticket ${payload.ticket_id}`);

    // Real-time processing for new tickets
    if (eventType === "ticket-created") {
      // Auto-triage: classify, tag, assign, post Slack card
      after(
        handleAutoTriage(payload as unknown as GorgiasHttpIntegrationPayload).catch(
          (err) => console.error("[gorgias-webhook] Auto-triage failed:", err),
        ),
      );
      // Urgent alert (critical/safety patterns only)
      after(
        handleNewTicketAlert(payload as unknown as GorgiasHttpIntegrationPayload).catch(
          (err) => console.error("[gorgias-webhook] Urgent alert failed:", err),
        ),
      );
    }

    return NextResponse.json({ ok: true, logged: count });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[gorgias-webhook] Error:`, message);

    try {
      await logApiError({
        endpoint: "/api/webhooks/gorgias/events",
        method: "POST",
        error: message,
        duration: Date.now() - startTime,
      });
    } catch {
      // Don't let logging failure mask the original error
    }

    // Dead letter: notify ops so no event silently disappears
    // after() requires Next.js request context — fall back to fire-and-forget in test/non-Next envs
    const dlNotify = notifyDeadLetter({ eventType, ticketId, error: message }).catch(
      (e) => console.error("[gorgias-webhook] Dead letter notify failed:", e),
    );
    try {
      after(dlNotify);
    } catch {
      void dlNotify;
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
