import type { ClassifiedIntent } from "./classifier";
import { getTicket, searchTickets } from "@/lib/gorgias/client";
import { prisma } from "@/lib/prisma";
import type { GorgiasTicket } from "@/lib/gorgias/mock";

export interface ExecutionResult {
  text: string;
  ticketIds?: number[];
  action?: string;
  // Raw data for formatters — only populated for read/search intents
  ticket?: GorgiasTicket;
  tickets?: GorgiasTicket[];
  searchQuery?: string;
}

const SYSTEM_PROMPT = `You are Ironside Support AI — a sharp ops analyst for Ironside Computers (custom gaming PC builder, 15-20 day build time, DHL shipping).

Team: Spencer (senior), Danni-Jean (verifications/returns), Mackenzie (promotions), Gabe (part-time).

VOICE: Answer first, details second. Use numbers. Be direct. Never say "I". Keep it to 2-5 lines. Suggest one next action.

For ticket-specific operations, direct users to slash commands:
- /ironside ticket <id> — look up a specific ticket
- /ironside search <keyword> — search tickets
- /ironside pulse — run full analytics
- /ironside status — system health
- /ironside stats — latest metrics
- /ironside help — all commands`;

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
    if (!pulse) return "No pulse data available yet. Suggest running /ironside pulse.";

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

  // Search tickets
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

async function executeChat(
  originalMessage: string,
  _channel: string
): Promise<ExecutionResult> {
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

export async function executeIntent(
  classified: ClassifiedIntent,
  originalMessage: string,
  channel: string
): Promise<ExecutionResult> {
  switch (classified.intent) {
    case "read":
      return executeRead(classified);

    case "chat":
      return executeChat(originalMessage, channel);

    case "write":
    case "ops":
      return {
        text: "Use /ironside commands for those operations. Say 'show ticket <id>' to look up a ticket.",
        action: "placeholder",
      };

    default:
      return executeChat(originalMessage, channel);
  }
}
