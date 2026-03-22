import type { ClassifiedIntent } from "./classifier";
import {
  getTicket,
  searchTickets,
  assignTicket,
  setPriority,
  setStatus,
  updateTags,
  replyPublic,
  commentInternal,
  createTicket,
} from "@/lib/gorgias/client";
import { calculateAnalytics } from "@/lib/analytics/calculate";
import { classifyTicket } from "@/lib/langchain/tools/sw4-triage";
import { scanAging, scanCritical, scanOverdue } from "@/lib/langchain/tools/sw6-escalation";
import { TEMPLATES, fillTemplate } from "@/lib/langchain/tools/sw5-templates";
import { prisma } from "@/lib/prisma";
import type { GorgiasTicket } from "@/lib/gorgias/mock";
import type { EscalationItem } from "@/lib/langchain/tools/sw6-escalation";
import { requiresConfirmation, createConfirmation, type PendingConfirmation } from "./confirmation";

export interface ExecutionResult {
  text: string;
  ticketIds?: number[];
  action?: string;
  ticket?: GorgiasTicket;
  tickets?: GorgiasTicket[];
  searchQuery?: string;
  confirmation?: PendingConfirmation;
  escalationItems?: EscalationItem[];
  analyticsData?: ReturnType<typeof calculateAnalytics>;
}

// --- Agent email mapping ---
const AGENT_EMAILS: Record<string, string> = {
  spencer: "spencer@ironsidecomputers.com",
  "danni-jean": "danni-jean@ironsidecomputers.com",
  mackenzie: "mackenzie@ironsidecomputers.com",
  gabe: "gabe@ironsidecomputers.com",
};

// --- System prompt for chat ---
const SYSTEM_PROMPT = `You are Ironside Support AI — a sharp ops analyst for Ironside Computers (custom gaming PC builder, 15-20 day build time, DHL shipping).

Team: Spencer (senior), Danni-Jean (verifications/returns), Mackenzie (promotions), Gabe (part-time).

VOICE: Answer first, details second. Use numbers. Be direct. Never say "I". Keep it to 2-5 lines. Suggest one next action.

You can help with:
- Looking up tickets: "show ticket 254126"
- Searching tickets: "find open tickets"
- Assigning tickets: "assign ticket 123 to Spencer"
- Closing tickets: "close ticket 456"
- Analytics: "how's the team doing?"
- Escalations: "any escalations?"
- Triage: "triage ticket 789"`;

async function getLatestPulseContext(): Promise<string> {
  try {
    const pulse = await prisma.pulseCheck.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        ticketCount: true,
        openTickets: true,
        closedTickets: true,
        spamRate: true,
        unassignedPct: true,
        resolutionP90Min: true,
        topCategory: true,
        opsNotes: true,
        createdAt: true,
      },
    });
    if (!pulse) return "No pulse data available yet.";

    const notes = (pulse.opsNotes as string[]) ?? [];
    return [
      `LATEST DATA (${pulse.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}):`,
      `${pulse.openTickets ?? 0} open, ${pulse.closedTickets ?? 0} closed, ${pulse.ticketCount ?? 0} total`,
      `Spam: ${pulse.spamRate ?? 0}%, Unassigned: ${pulse.unassignedPct ?? 0}%`,
      pulse.resolutionP90Min ? `P90 resolution: ${pulse.resolutionP90Min} min` : null,
      pulse.topCategory ? `Top category: ${pulse.topCategory}` : null,
      notes.length > 0 ? `Notes: ${notes.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "Could not fetch latest data.";
  }
}

// --- Read ---

async function executeRead(classified: ClassifiedIntent): Promise<ExecutionResult> {
  if (classified.params.ticket_id) {
    const ticket = await getTicket(classified.params.ticket_id);
    if (!ticket) {
      return {
        text: `Ticket #${classified.params.ticket_id} not found.`,
        action: "read_ticket_not_found",
      };
    }
    return {
      text: "",
      ticket,
      ticketIds: [ticket.id],
      action: "read_ticket",
    };
  }

  const results = await searchTickets({
    search: classified.params.search,
    status: "open",
    limit: 5,
  });

  return {
    text: "",
    tickets: results,
    ticketIds: results.map((t) => t.id),
    searchQuery: classified.params.search ?? "",
    action: "search_tickets",
  };
}

// --- Write ---

async function executeWrite(classified: ClassifiedIntent): Promise<ExecutionResult> {
  const { operation, ticket_id } = classified.params;

  if (!operation) {
    return { text: "Could not determine which operation to perform. Try being more specific.", action: "write_error" };
  }

  // Create ticket doesn't need a ticket_id
  if (operation === "create_ticket") {
    const email = classified.params.customer_email;
    const subject = classified.params.subject ?? "New ticket";
    const body = classified.params.body ?? "";
    if (!email) {
      return { text: "Need a customer email to create a ticket. Example: create ticket for john@example.com about 'Shipping delay'", action: "write_error" };
    }
    if (requiresConfirmation(operation)) {
      return {
        text: `Create new ticket for ${email}: "${subject}"?\nReply "yes" to confirm.`,
        confirmation: createConfirmation(operation, { customer_email: email, subject, message: body }, `Create ticket for ${email}: "${subject}"`),
        action: "write_confirm",
      };
    }
    await createTicket({ customer_email: email, subject, message: body });
    return { text: `Ticket created for ${email}: "${subject}"`, action: "create_ticket" };
  }

  if (!ticket_id) {
    return { text: "Which ticket? Provide a ticket ID. Example: assign ticket 254126 to Spencer", action: "write_error" };
  }

  switch (operation) {
    case "assign_ticket": {
      const assignee = classified.params.assignee;
      if (!assignee) {
        return { text: "Who should this be assigned to? Options: Spencer, Danni-Jean, Mackenzie, Gabe", action: "write_error" };
      }
      const email = AGENT_EMAILS[assignee];
      if (!email) {
        return { text: `Unknown agent "${assignee}". Options: Spencer, Danni-Jean, Mackenzie, Gabe`, action: "write_error" };
      }
      await assignTicket(ticket_id, email);
      return { text: `Ticket #${ticket_id} assigned to ${assignee}.`, ticketIds: [ticket_id], action: "assign_ticket" };
    }

    case "set_priority": {
      const priority = classified.params.priority ?? "normal";
      await setPriority(ticket_id, priority);
      return { text: `Ticket #${ticket_id} priority set to ${priority}.`, ticketIds: [ticket_id], action: "set_priority" };
    }

    case "set_status": {
      const status = (classified.params.status as "open" | "closed") ?? "closed";
      if (status === "closed" && requiresConfirmation("close")) {
        return {
          text: `Close ticket #${ticket_id}?\nReply "yes" to confirm.`,
          confirmation: createConfirmation("close", { ticket_id, status }, `Close ticket #${ticket_id}`),
          ticketIds: [ticket_id],
          action: "write_confirm",
        };
      }
      await setStatus(ticket_id, status);
      return { text: `Ticket #${ticket_id} status set to ${status}.`, ticketIds: [ticket_id], action: "set_status" };
    }

    case "update_tags": {
      const tags = classified.params.tags ?? [];
      if (tags.length === 0) {
        return { text: "Which tags? Example: tag ticket 123 as urgent, priority", action: "write_error" };
      }
      await updateTags(ticket_id, tags);
      return { text: `Ticket #${ticket_id} tags updated: ${tags.join(", ")}`, ticketIds: [ticket_id], action: "update_tags" };
    }

    case "reply_public": {
      const body = classified.params.body;
      if (!body) {
        return { text: "What should the reply say? Example: reply to ticket 123: We're looking into it", action: "write_error" };
      }
      if (requiresConfirmation(operation)) {
        return {
          text: `Send public reply on ticket #${ticket_id}:\n> ${body}\nReply "yes" to confirm.`,
          confirmation: createConfirmation(operation, { ticket_id, body }, `Reply to ticket #${ticket_id}`),
          ticketIds: [ticket_id],
          action: "write_confirm",
        };
      }
      await replyPublic(ticket_id, body);
      return { text: `Public reply sent on ticket #${ticket_id}.`, ticketIds: [ticket_id], action: "reply_public" };
    }

    case "comment_internal": {
      const body = classified.params.body;
      if (!body) {
        return { text: "What should the internal note say?", action: "write_error" };
      }
      await commentInternal(ticket_id, body);
      return { text: `Internal note added to ticket #${ticket_id}.`, ticketIds: [ticket_id], action: "comment_internal" };
    }

    default:
      return { text: `Unknown operation: ${operation}`, action: "write_error" };
  }
}

// --- Execute pending confirmation ---

export async function executePendingAction(
  pending: PendingConfirmation
): Promise<ExecutionResult> {
  const { operation, params } = pending;
  const ticketId = params.ticket_id as number | undefined;

  switch (operation) {
    case "close":
    case "set_status": {
      const status = (params.status as "open" | "closed") ?? "closed";
      await setStatus(ticketId!, status);
      return { text: `Done. Ticket #${ticketId} is now ${status}.`, ticketIds: ticketId ? [ticketId] : [], action: "set_status" };
    }

    case "reply_public": {
      await replyPublic(ticketId!, params.body as string);
      return { text: `Done. Public reply sent on ticket #${ticketId}.`, ticketIds: ticketId ? [ticketId] : [], action: "reply_public" };
    }

    case "create_ticket": {
      await createTicket({
        customer_email: params.customer_email as string,
        subject: params.subject as string,
        message: params.message as string,
      });
      return { text: `Done. Ticket created for ${params.customer_email}.`, action: "create_ticket" };
    }

    default:
      return { text: `Unknown pending operation: ${operation}`, action: "error" };
  }
}

// --- Ops ---

async function executeOps(classified: ClassifiedIntent): Promise<ExecutionResult> {
  const subIntent = classified.params.sub_intent ?? "analytics";

  switch (subIntent) {
    case "analytics": {
      const tickets = await searchTickets({ status: "open" });
      const analytics = calculateAnalytics(tickets);
      return {
        text: "",
        analyticsData: analytics,
        action: "analytics",
      };
    }

    case "triage": {
      if (!classified.params.ticket_id) {
        return { text: "Which ticket should I triage? Provide a ticket ID.", action: "triage_error" };
      }
      const ticket = await getTicket(classified.params.ticket_id);
      if (!ticket) {
        return { text: `Ticket #${classified.params.ticket_id} not found.`, action: "triage_error" };
      }
      const msgText = ticket.messages.map((m) => m.body_text).join("\n");
      const result = await classifyTicket(ticket.subject, msgText);
      return {
        text: `Triage for #${ticket.id} — ${ticket.subject}:\nCategory: ${result.category}\nPriority: ${result.suggestedPriority}\nSentiment: ${result.sentiment}\nSuggested agent: ${result.suggestedAgent ?? "auto-assign"}\nReason: ${result.reason}`,
        ticketIds: [ticket.id],
        action: "triage",
      };
    }

    case "escalation": {
      const tickets = await searchTickets({ status: "open" });
      const aging = scanAging(tickets, 4);
      const critical = scanCritical(tickets);
      const overdue = scanOverdue(tickets);
      const all = [...critical, ...aging, ...overdue];

      if (all.length === 0) {
        return { text: "No escalations found. All clear.", action: "escalation" };
      }

      return {
        text: "",
        escalationItems: all,
        action: "escalation",
      };
    }

    case "template": {
      const templateList = TEMPLATES.map((t) => `• ${t.name} (${t.category})`).join("\n");
      return {
        text: `Available templates:\n${templateList}\n\nUse /ironside template <name> to send one.`,
        action: "template_list",
      };
    }

    default:
      return { text: `Unknown ops sub-intent: ${subIntent}. Try "analytics", "escalations", "triage ticket <id>".`, action: "ops_error" };
  }
}

// --- Chat ---

async function executeChat(originalMessage: string): Promise<ExecutionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { text: "AI unavailable — OPENROUTER_API_KEY not configured.", action: "chat_error" };
  }

  const context = await getLatestPulseContext();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${context}` },
        { role: "user", content: originalMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[executor/chat] OpenRouter error:", response.status, errText);
    return { text: "Could not get a response right now. Try again shortly.", action: "chat_error" };
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  return { text: content, action: "chat" };
}

// --- Main dispatcher ---

export async function executeIntent(
  classified: ClassifiedIntent,
  originalMessage: string,
): Promise<ExecutionResult> {
  switch (classified.intent) {
    case "read":
      return executeRead(classified);
    case "write":
      return executeWrite(classified);
    case "ops":
      return executeOps(classified);
    case "chat":
      return executeChat(originalMessage);
    default:
      return executeChat(originalMessage);
  }
}
