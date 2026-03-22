import type { GorgiasTicket } from "@/lib/gorgias/mock";

function ageHours(dateStr: string): number {
  const updated = new Date(dateStr);
  const now = new Date();
  return Math.round((now.getTime() - updated.getTime()) / (1000 * 60 * 60));
}

function formatAge(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function assigneeLabel(assignee: string | null): string {
  if (!assignee) return "unassigned";
  // Strip domain if it's an email, extract first name
  const local = assignee.includes("@") ? assignee.split("@")[0] : assignee;
  // Capitalize first letter
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function formatTicketResult(ticket: GorgiasTicket): string {
  const lastMsgDate =
    ticket.messages.length > 0
      ? ticket.messages[ticket.messages.length - 1].created_datetime
      : ticket.created_datetime;

  const age = formatAge(ageHours(lastMsgDate));
  const assignee = assigneeLabel(ticket.assignee);
  const tagStr = ticket.tags.length > 0 ? `  Tags: ${ticket.tags.join(", ")}` : "";
  const category = ticket.channel;
  const msgCount = ticket.messages.length;

  return [
    `Ticket #${ticket.id} — ${ticket.subject}`,
    `Status: ${ticket.status}  |  Assigned: ${assignee}  |  Updated: ${age}`,
    `Channel: ${category}  |  Messages: ${msgCount}`,
    tagStr,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatSearchResult(tickets: GorgiasTicket[], query: string): string {
  if (tickets.length === 0) {
    return query ? `No tickets found matching "${query}".` : "No tickets found.";
  }

  const header = query
    ? `Found ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} matching "${query}"`
    : `Found ${tickets.length} open ticket${tickets.length === 1 ? "" : "s"}`;

  const lines = tickets.map((t) => {
    const lastMsgDate =
      t.messages.length > 0
        ? t.messages[t.messages.length - 1].created_datetime
        : t.created_datetime;
    const age = formatAge(ageHours(lastMsgDate));
    const assignee = assigneeLabel(t.assignee);
    return `• #${t.id} — ${t.subject} (${t.status}, assigned to ${assignee}, ${age})`;
  });

  return [header, ...lines].join("\n");
}

export function formatChatResponse(response: string): string {
  return response.trim();
}
