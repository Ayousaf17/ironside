import type { ConversationContext } from "@prisma/client";
import { isConfirmationMessage } from "./confirmation";

export interface ClassifiedIntent {
  intent: "read" | "write" | "ops" | "chat" | "confirm";
  params: {
    ticket_id?: number;
    search?: string;
    operation?: string;
    sub_intent?: string;
    assignee?: string;
    priority?: string;
    status?: string;
    tags?: string[];
    body?: string;
    subject?: string;
    customer_email?: string;
  };
  confidence: number;
}

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a support ops Slack bot. Return JSON only.

Intents:
- "read": look up ticket(s). Examples: "show ticket 254126", "find open tickets"
- "write": modify a ticket. Params must include "operation". Examples:
    "assign ticket 123 to Spencer" → {"intent":"write","params":{"ticket_id":123,"operation":"assign_ticket","assignee":"spencer"},"confidence":0.95}
    "close ticket 456" → {"intent":"write","params":{"ticket_id":456,"operation":"set_status","status":"closed"},"confidence":0.9}
    "tag ticket 789 as urgent" → {"intent":"write","params":{"ticket_id":789,"operation":"update_tags","tags":["urgent"]},"confidence":0.9}
    "set priority high on ticket 123" → {"intent":"write","params":{"ticket_id":123,"operation":"set_priority","priority":"high"},"confidence":0.9}
    "reply to ticket 123: we're on it" → {"intent":"write","params":{"ticket_id":123,"operation":"reply_public","body":"we're on it"},"confidence":0.9}
    "add internal note to ticket 123: checking shipping" → {"intent":"write","params":{"ticket_id":123,"operation":"comment_internal","body":"checking shipping"},"confidence":0.9}
- "ops": analytics/triage/escalation. Params must include "sub_intent". Examples:
    "how's the team" → {"intent":"ops","params":{"sub_intent":"analytics"},"confidence":0.9}
    "any escalations" → {"intent":"ops","params":{"sub_intent":"escalation"},"confidence":0.9}
    "triage ticket 789" → {"intent":"ops","params":{"sub_intent":"triage","ticket_id":789},"confidence":0.9}
    "show templates" → {"intent":"ops","params":{"sub_intent":"template"},"confidence":0.9}
- "chat": general conversation. Examples: "hey", "thanks", "what can you do"

If the user says "it" or "that ticket" and context mentions a ticket, use the context ticket ID.
Agents: Spencer, Danni-Jean, Mackenzie, Gabe. Match partial names case-insensitively.

Return: {"intent":"...","params":{...},"confidence":0.95}`;

// Maps common agent name variations to their canonical form
const AGENT_MAP: Record<string, string> = {
  spencer: "spencer",
  danni: "danni-jean",
  "danni-jean": "danni-jean",
  dannijean: "danni-jean",
  mackenzie: "mackenzie",
  mack: "mackenzie",
  gabe: "gabe",
};

function normalizeAgentName(name: string): string | undefined {
  const lower = name.toLowerCase().trim();
  return AGENT_MAP[lower];
}

function regexFallback(
  message: string,
  context?: Pick<ConversationContext, "lastAction" | "lastTicketIds">
): ClassifiedIntent {
  const ticketMatch = message.match(/(?:ticket|#)\s*(\d{5,})/i);
  const ticketId = ticketMatch
    ? parseInt(ticketMatch[1], 10)
    : context?.lastTicketIds?.[0];

  // Write patterns
  const assignMatch = message.match(/assign\s+(?:it|ticket\s*#?\d*)\s+to\s+(\w+)/i);
  if (assignMatch && ticketId) {
    const assignee = normalizeAgentName(assignMatch[1]);
    if (assignee) {
      return {
        intent: "write",
        params: { ticket_id: ticketId, operation: "assign_ticket", assignee },
        confidence: 0.6,
      };
    }
  }

  const closeMatch = message.match(/close\s+(?:it|ticket|#?\d)/i);
  if (closeMatch && ticketId) {
    return {
      intent: "write",
      params: { ticket_id: ticketId, operation: "set_status", status: "closed" },
      confidence: 0.6,
    };
  }

  // Read pattern
  if (ticketMatch) {
    return {
      intent: "read",
      params: { ticket_id: parseInt(ticketMatch[1], 10) },
      confidence: 0.5,
    };
  }

  // Ops patterns
  if (/escalat|aging|overdue|critical/i.test(message)) {
    return { intent: "ops", params: { sub_intent: "escalation" }, confidence: 0.5 };
  }
  if (/analytic|team|stats|performance|how.*doing/i.test(message)) {
    return { intent: "ops", params: { sub_intent: "analytics" }, confidence: 0.5 };
  }
  if (/triage|classify|categorize/i.test(message)) {
    return { intent: "ops", params: { sub_intent: "triage" }, confidence: 0.5 };
  }
  if (/template|response template/i.test(message)) {
    return { intent: "ops", params: { sub_intent: "template" }, confidence: 0.5 };
  }

  return { intent: "chat", params: {}, confidence: 0.5 };
}

export async function classifyIntent(
  message: string,
  context?: Pick<ConversationContext, "lastAction" | "lastTicketIds" | "pendingConfirmation">
): Promise<ClassifiedIntent> {
  // Fast path: check for confirmation messages
  if (isConfirmationMessage(message)) {
    return { intent: "confirm", params: {}, confidence: 1.0 };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[classifier] OPENROUTER_API_KEY not set, using regex fallback");
    return regexFallback(message, context);
  }

  const contextParts: string[] = [];
  if (context?.lastTicketIds?.length) {
    contextParts.push(
      `Conversation context: user was recently looking at ticket(s) ${context.lastTicketIds.join(", ")}. If they say "it" or "that ticket", use ticket ${context.lastTicketIds[0]}.`
    );
  }
  if (context?.lastAction) {
    contextParts.push(`Last action: ${context.lastAction}.`);
  }
  const contextNote = contextParts.length > 0 ? "\n" + contextParts.join(" ") : "";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-5-haiku-20241022",
        temperature: 0.0,
        max_tokens: 200,
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT + contextNote },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[classifier] OpenRouter error:", response.status, await response.text());
      return regexFallback(message, context);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(cleaned) as ClassifiedIntent;

    // Normalize agent name if present
    if (parsed.params?.assignee) {
      const normalized = normalizeAgentName(parsed.params.assignee);
      if (normalized) parsed.params.assignee = normalized;
    }

    return {
      intent: parsed.intent ?? "chat",
      params: parsed.params ?? {},
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
    };
  } catch (err) {
    console.error("[classifier] Error, falling back to regex:", err);
    return regexFallback(message, context);
  }
}
