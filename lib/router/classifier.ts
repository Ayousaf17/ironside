import type { ConversationContext } from "@prisma/client";

export interface ClassifiedIntent {
  intent: "read" | "write" | "ops" | "chat";
  params: {
    ticket_id?: number;
    search?: string;
    operation?: string;
    sub_intent?: string;
  };
  confidence: number;
}

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a support ops Slack bot. Return JSON only.

Intents:
- "read": look up ticket(s). Examples: "show ticket 254126", "find open tickets", "what's ticket status"
- "write": modify a ticket. Examples: "assign ticket 123 to Spencer", "close ticket 456", "tag as urgent"
- "ops": analytics/triage/escalation. Examples: "how's the team", "any escalations", "triage ticket 789"
- "chat": general conversation. Examples: "hey", "thanks", "what can you do"

Return: {"intent":"read","params":{"ticket_id":254126},"confidence":0.95}`;

function regexFallback(message: string): ClassifiedIntent {
  const ticketMatch = message.match(/(?:ticket|#)\s*(\d{5,})/i);
  if (ticketMatch) {
    return {
      intent: "read",
      params: { ticket_id: parseInt(ticketMatch[1], 10) },
      confidence: 0.5,
    };
  }
  return { intent: "chat", params: {}, confidence: 0.5 };
}

export async function classifyIntent(
  message: string,
  context?: Pick<ConversationContext, "lastAction" | "lastTicketIds">
): Promise<ClassifiedIntent> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[classifier] OPENROUTER_API_KEY not set, using regex fallback");
    return regexFallback(message);
  }

  const contextNote =
    context?.lastTicketIds?.length
      ? `\nConversation context: user was recently looking at ticket(s) ${context.lastTicketIds.join(", ")}.`
      : "";

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
        max_tokens: 150,
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT + contextNote },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[classifier] OpenRouter error:", response.status, await response.text());
      return regexFallback(message);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(cleaned) as {
      intent: "read" | "write" | "ops" | "chat";
      params: ClassifiedIntent["params"];
      confidence: number;
    };

    return {
      intent: parsed.intent ?? "chat",
      params: parsed.params ?? {},
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
    };
  } catch (err) {
    console.error("[classifier] Error, falling back to regex:", err);
    return regexFallback(message);
  }
}
