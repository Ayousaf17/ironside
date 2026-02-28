// Gorgias webhook event parser — turns raw Gorgias events into structured
// AgentBehaviorLog records for training data.
//
// Gorgias webhook events we care about:
//   ticket-created        — who created it, initial category
//   ticket-updated        — status changes (close, reopen), tag changes, assignment changes
//   ticket-message-created — agent replies, internal notes, macro usage
//
// n8n equivalent: a Webhook node → Switch node → multiple Set nodes extracting fields.

import { prisma } from "@/lib/prisma";

// --- Gorgias webhook payload types ---

interface GorgiasWebhookPayload {
  type: string;           // "ticket-created", "ticket-updated", "ticket-message-created"
  ticket_id: number;
  ticket?: {
    id: number;
    subject?: string;
    status?: string;
    assignee_user?: { email: string; first_name?: string } | null;
    tags?: { name: string }[];
    created_datetime?: string;
    customer?: { email: string; first_name?: string };
  };
  message?: {
    id: number;
    channel: string;        // "email", "chat", "internal-note"
    from_agent: boolean;
    body_text: string;
    sender?: { type: string; email?: string; first_name?: string };
    created_datetime: string;
    via?: string;
    meta?: { macro_id?: number };
  };
  // For ticket-updated events, Gorgias sends changes
  changes?: {
    status?: { from: string; to: string };
    assignee_user?: { from: { email: string } | null; to: { email: string } | null };
    tags?: { from: { name: string }[]; to: { name: string }[] };
  };
  created_datetime?: string;
}

// --- Category detection (reuses SW4 logic) ---

function detectCategory(subject: string, tags: string[]): string {
  const s = subject.toLowerCase();
  const t = tags.map(tag => tag.toLowerCase());

  if (t.includes("auto-close") || t.includes("non-support-related")) return "spam";
  if (t.includes("order-status") || s.includes("track order") || s.includes("order status") || s.includes("where is my order")) return "track_order";
  if (s.includes("verification") || s.includes("verify")) return "order_verification";
  if (s.includes("return") || s.includes("exchange") || s.includes("refund")) return "return_exchange";
  if (s.includes("water cooling") || s.includes("leak") || s.includes("wifi") || s.includes("driver") || s.includes("doa") || s.includes("not working") || s.includes("broken")) return "report_issue";
  if (s.includes("specs") || s.includes("compatible") || s.includes("recommend") || s.includes("which") || s.includes("custom")) return "product_question";
  if (s.includes("contact") || s.includes("form")) return "contact_form";

  return "other";
}

// --- Parse a single Gorgias webhook event into behavior log(s) ---

export interface BehaviorLogEntry {
  gorgiasEventId?: string;
  agent: string;
  action: string;
  ticketId: number;
  ticketSubject?: string;
  category?: string;
  responseText?: string;
  macroIdUsed?: number;
  tagsApplied: string[];
  reopened: boolean;
  rawEvent: object;
  occurredAt: Date;
}

export function parseGorgiasEvent(payload: GorgiasWebhookPayload): BehaviorLogEntry[] {
  const entries: BehaviorLogEntry[] = [];
  const ticketId = payload.ticket_id || payload.ticket?.id || 0;
  const subject = payload.ticket?.subject || "";
  const tags = payload.ticket?.tags?.map(t => t.name) || [];
  const category = detectCategory(subject, tags);
  const occurredAt = new Date(payload.created_datetime || payload.message?.created_datetime || new Date().toISOString());

  switch (payload.type) {
    case "ticket-created": {
      const agent = payload.ticket?.assignee_user?.email || "system";
      entries.push({
        agent,
        action: "ticket_created",
        ticketId,
        ticketSubject: subject,
        category,
        tagsApplied: tags,
        reopened: false,
        rawEvent: payload,
        occurredAt,
      });
      break;
    }

    case "ticket-updated": {
      const changes = payload.changes;
      if (!changes) break;

      // Status change (close or reopen)
      if (changes.status) {
        const agent = payload.ticket?.assignee_user?.email || "system";
        const isReopen = changes.status.from === "closed" && changes.status.to === "open";
        entries.push({
          agent,
          action: isReopen ? "reopen" : "close",
          ticketId,
          ticketSubject: subject,
          category,
          tagsApplied: tags,
          reopened: isReopen,
          rawEvent: payload,
          occurredAt,
        });
      }

      // Assignment change
      if (changes.assignee_user) {
        const newAgent = changes.assignee_user.to?.email || "unassigned";
        entries.push({
          agent: newAgent,
          action: "assign",
          ticketId,
          ticketSubject: subject,
          category,
          tagsApplied: tags,
          reopened: false,
          rawEvent: payload,
          occurredAt,
        });
      }

      // Tag change
      if (changes.tags) {
        const agent = payload.ticket?.assignee_user?.email || "system";
        const newTags = changes.tags.to.map(t => t.name);
        entries.push({
          agent,
          action: "tag",
          ticketId,
          ticketSubject: subject,
          category: detectCategory(subject, newTags),
          tagsApplied: newTags,
          reopened: false,
          rawEvent: payload,
          occurredAt,
        });
      }
      break;
    }

    case "ticket-message-created": {
      const msg = payload.message;
      if (!msg || !msg.from_agent) break; // Only log agent actions, not customer messages

      const agent = msg.sender?.email || payload.ticket?.assignee_user?.email || "unknown";
      const isInternal = msg.channel === "internal-note";
      const macroId = msg.meta?.macro_id;

      entries.push({
        agent,
        action: macroId ? "macro_used" : isInternal ? "internal_note" : "reply",
        ticketId,
        ticketSubject: subject,
        category,
        responseText: msg.body_text,
        macroIdUsed: macroId,
        tagsApplied: tags,
        reopened: false,
        rawEvent: payload,
        occurredAt,
      });
      break;
    }
  }

  return entries;
}

// --- Write parsed entries to database ---

export async function logBehaviorEntries(entries: BehaviorLogEntry[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
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
    count++;
  }
  return count;
}
