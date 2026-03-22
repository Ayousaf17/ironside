// Gorgias webhook event parser — turns raw Gorgias events into structured
// AgentBehaviorLog records for training data.
//
// Gorgias webhook events we care about:
//   ticket-created        — who created it, initial category
//   ticket-updated        — status changes (close, reopen), tag changes, assignment changes
//   ticket-message-created — agent replies, internal notes, macro usage
//
// n8n equivalent: a Webhook node → Switch node → multiple Set nodes extracting fields.

// --- Gorgias webhook payload types ---

// Native webhook format (from Gorgias Webhooks API — not currently used)
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

// HTTP Integration format — flat JSON built from Gorgias {{template.variables}}
// Each trigger type gets its own HTTP Integration with hardcoded event_type field
export interface GorgiasHttpIntegrationPayload {
  event_type: string;           // hardcoded per integration: "ticket-created", "ticket-updated", "ticket-message-created"
  ticket_id: string | number;   // {{ticket.id}} — Gorgias may send as string
  subject?: string;             // {{ticket.subject}}
  status?: string;              // {{ticket.status}}
  channel?: string;             // {{ticket.channel}}
  customer_name?: string;       // {{ticket.customer.name}}
  customer_email?: string;      // {{ticket.customer.email}}
  assignee_email?: string;      // {{ticket.assignee_user.email}}
  assignee_name?: string;       // {{ticket.assignee_user.name}}
  last_message?: string;        // {{ticket.messages[-1].body_text}}
  tags?: string;                // {{ticket.tags}} — comes as string, not array
  created_at?: string;          // {{ticket.created_datetime}}
  updated_at?: string;          // {{ticket.updated_datetime}}
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
  macroName?: string;
  tagsApplied: string[];
  reopened: boolean;
  rawEvent: object;
  occurredAt: Date;
  // Phase 3 enrichment fields
  agentEmail?: string;
  ticketChannel?: string;
  ticketTags?: string[];
  responseCharCount?: number;
  messagePosition?: number;
  isFirstResponse?: boolean;
  timeToRespondMin?: number;
  touchesToResolution?: number;
}

// --- Detect payload format ---
// HTTP Integration payloads have event_type (hardcoded string we set)
// Native webhook payloads have type (sent by Gorgias)

function isHttpIntegrationPayload(payload: Record<string, unknown>): boolean {
  return typeof payload.event_type === "string";
}

// --- Parse HTTP Integration payload (flat template-variable format) ---

function parseTags(tagsField: unknown): string[] {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) {
    // Could be string[] or {name: string}[]
    return tagsField.map(t => typeof t === "string" ? t : (t as Record<string, unknown>)?.name as string ?? "").filter(Boolean);
  }
  const str = String(tagsField);
  if (!str || str === "[]" || str === "None") return [];
  // Gorgias {{ticket.tags}} comes as Python-repr: "[{'id': 123, 'name': 'auto-close', ...}]"
  // Extract just the 'name' values
  const nameMatches = str.matchAll(/'name':\s*'([^']+)'/g);
  const names = Array.from(nameMatches, m => m[1]);
  if (names.length > 0) return names;
  // Fallback: simple comma-split for plain tag strings like "order-status, vip"
  return str.split(",").map(t => t.replace(/[[\]'{}/]/g, "").trim()).filter(Boolean);
}

export function parseHttpIntegrationEvent(payload: GorgiasHttpIntegrationPayload): BehaviorLogEntry[] {
  const entries: BehaviorLogEntry[] = [];
  const ticketId = Number(payload.ticket_id) || 0;
  const subject = payload.subject || "";
  const tags = parseTags(payload.tags);
  const category = detectCategory(subject, tags);
  const agent = payload.assignee_email || "system";
  const occurredAt = new Date(payload.updated_at || payload.created_at || new Date().toISOString());

  switch (payload.event_type) {
    case "ticket-created": {
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
        agentEmail: payload.assignee_email || undefined,
        ticketChannel: payload.channel || undefined,
        ticketTags: tags,
      });
      break;
    }

    case "ticket-updated": {
      entries.push({
        agent,
        action: "update",
        ticketId,
        ticketSubject: subject,
        category,
        tagsApplied: tags,
        reopened: false,
        rawEvent: payload,
        occurredAt,
        agentEmail: payload.assignee_email || undefined,
        ticketChannel: payload.channel || undefined,
        ticketTags: tags,
      });
      break;
    }

    case "ticket-message-created": {
      const messageText = payload.last_message || "";
      entries.push({
        agent,
        action: "message",
        ticketId,
        ticketSubject: subject,
        category,
        responseText: messageText || undefined,
        tagsApplied: tags,
        reopened: false,
        rawEvent: payload,
        occurredAt,
        agentEmail: payload.assignee_email || undefined,
        ticketChannel: payload.channel || undefined,
        ticketTags: tags,
        responseCharCount: messageText ? messageText.length : undefined,
      });
      break;
    }
  }

  return entries;
}

// --- Parse native Gorgias webhook payload (rich nested format) ---

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
        agentEmail: payload.ticket?.assignee_user?.email || undefined,
        ticketTags: tags,
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
        agentEmail: msg.sender?.email || payload.ticket?.assignee_user?.email || undefined,
        ticketChannel: msg.channel || undefined,
        ticketTags: tags,
        responseCharCount: msg.body_text ? msg.body_text.length : undefined,
      });
      break;
    }
  }

  return entries;
}

// --- Unified entry point — detects payload format and routes to correct parser ---

export function parseEvent(payload: Record<string, unknown>): BehaviorLogEntry[] {
  if (isHttpIntegrationPayload(payload)) {
    return parseHttpIntegrationEvent(payload as unknown as GorgiasHttpIntegrationPayload);
  }
  return parseGorgiasEvent(payload as unknown as GorgiasWebhookPayload);
}

