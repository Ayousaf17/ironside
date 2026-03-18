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
import { createHmac, timingSafeEqual } from "crypto";
import { parseEvent } from "@/lib/gorgias/events";
import { enrichBehaviorEntry } from "@/lib/gorgias/enrich";
import { logBehaviorEntries } from "@/lib/services/behavior.service";
import { logApiCall, logApiError } from "@/lib/services/logging.service";
import { handleNewTicketAlert } from "@/lib/slack/handlers/urgent-alert";
import type { GorgiasHttpIntegrationPayload } from "@/lib/gorgias/events";

export const maxDuration = 30;

// Gorgias native webhooks send HMAC-SHA256 of the raw body in X-Gorgias-Hmac-SHA256 (base64).
// If GORGIAS_WEBHOOK_SECRET is not set, verification is skipped (allows gradual rollout).
function verifyGorgiasSignature(rawBody: string, request: Request): boolean {
  const secret = process.env.GORGIAS_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = request.headers.get("x-gorgias-hmac-sha256");
  if (!signature) return false;

  const computed = createHmac("sha256", secret).update(rawBody).digest("base64");

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const rawBody = await request.text();

    if (!verifyGorgiasSignature(rawBody, request)) {
      console.warn("[gorgias-webhook] Signature verification failed — rejecting request");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    // Log the raw webhook for debugging
    const eventType = String(payload.event_type ?? payload.type ?? "unknown");
    console.log(`[gorgias-webhook] Received event: ${eventType} for ticket ${payload.ticket_id}`);

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

    // Phase 5: Real-time urgent alert for new tickets
    if (eventType === "ticket-created") {
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
