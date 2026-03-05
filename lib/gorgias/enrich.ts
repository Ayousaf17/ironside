// Enriches a BehaviorLogEntry by fetching the full ticket from Gorgias API.
// Populates: macroIdUsed, macroName, messagePosition, isFirstResponse,
// timeToRespondMin, touchesToResolution, ticketTags, ticketChannel.

import type { BehaviorLogEntry } from "./events";
import { fetchTicket, fetchMacro } from "./read";

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

  // Find the matching message by agent email + closest timestamp
  const agentMessages = ticket.messages.filter(m => m.sender?.type === "agent");
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
  let bestMatch: (typeof ticket.messages)[number] | null = null;
  let bestDiff = Infinity;

  for (const msg of ticket.messages) {
    // Match by agent email if available, otherwise by agent type
    const isAgentMatch = entry.agentEmail
      ? (msg.sender as { email?: string })?.email === entry.agentEmail || msg.sender?.name === entry.agent
      : msg.sender?.type === "agent";

    if (!isAgentMatch) continue;

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

    // Macro detection from message meta
    const macroId = bestMatch.meta?.macro_id;
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
