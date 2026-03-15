// Enriches a BehaviorLogEntry by fetching the full ticket from Gorgias API.
// Populates: macroIdUsed, macroName, messagePosition, isFirstResponse,
// timeToRespondMin, touchesToResolution, ticketTags, ticketChannel.

import type { BehaviorLogEntry } from "./events";
import type { GorgiasMessage } from "./mock";
import { fetchTicket, fetchMacro } from "./read";

// Gorgias API uses from_agent boolean; mock data uses sender.type string.
function isAgentMessage(msg: GorgiasMessage): boolean {
  if (typeof msg.from_agent === "boolean") return msg.from_agent;
  return msg.sender?.type === "agent";
}

export async function enrichBehaviorEntry(entry: BehaviorLogEntry): Promise<BehaviorLogEntry> {
  if (!entry.ticketId) return entry;

  const ticket = await fetchTicket(entry.ticketId);
  if (!ticket || !ticket.messages?.length) return entry;

  const enriched = { ...entry };

  // Overwrite with full ticket data
  enriched.ticketChannel = ticket.channel || enriched.ticketChannel;
  // Gorgias API returns tags as objects {id, name, decoration} — extract just the name strings
  const apiTags = ticket.tags as unknown as { name: string }[];
  enriched.ticketTags = apiTags?.length ? apiTags.map(t => t.name) : enriched.ticketTags;

  // Find agent messages using from_agent (real API) or sender.type (mock)
  const agentMessages = ticket.messages.filter(isAgentMessage);
  enriched.touchesToResolution = agentMessages.length;

  // First agent response detection + time-to-respond
  const firstAgentMsg = agentMessages[0];
  if (firstAgentMsg) {
    const ticketCreated = new Date(ticket.created_datetime).getTime();
    const firstReply = new Date(firstAgentMsg.created_datetime).getTime();
    if (ticketCreated && firstReply && firstReply > ticketCreated) {
      enriched.timeToRespondMin = Math.round(((firstReply - ticketCreated) / 60000) * 100) / 100;
    }
  }

  // Match the specific message for this entry (by agent email + closest time)
  const entryTime = entry.occurredAt.getTime();
  let bestMatch: GorgiasMessage | null = null;
  let bestDiff = Infinity;

  for (const msg of ticket.messages) {
    // Match by agent email if available, otherwise by from_agent/sender.type
    const isMatch = entry.agentEmail
      ? msg.sender?.email === entry.agentEmail || msg.sender?.name === entry.agent
      : isAgentMessage(msg);

    if (!isMatch) continue;

    const msgTime = new Date(msg.created_datetime).getTime();
    const diff = Math.abs(msgTime - entryTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = msg;
    }
  }

  if (bestMatch) {
    // Message position (1-based index in all messages)
    const msgIndex = ticket.messages.indexOf(bestMatch);
    enriched.messagePosition = msgIndex + 1;

    // Is this the first agent response?
    enriched.isFirstResponse = firstAgentMsg ? bestMatch.id === firstAgentMsg.id : false;

    // Macro detection: check macros array (real API), then meta.macro_id (legacy/mock)
    const macroId = bestMatch.macros?.[0]?.id ?? bestMatch.meta?.macro_id;
    if (macroId) {
      enriched.macroIdUsed = macroId;
      try {
        const macro = await fetchMacro(macroId);
        if (macro) {
          enriched.macroName = macro.name;
        }
      } catch {
        // Macro lookup failed — not critical, continue without name
      }
    }
  }

  return enriched;
}
