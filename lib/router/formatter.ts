import type { GorgiasTicket } from "@/lib/gorgias/mock";
import type { TicketAnalytics } from "@/lib/analytics/calculate";
import type { EscalationItem } from "@/lib/langchain/tools/sw6-escalation";

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
  const local = assignee.includes("@") ? assignee.split("@")[0] : assignee;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// --- Read formatters ---

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

// --- Ops formatters ---

export function formatAnalyticsResult(analytics: TicketAnalytics): string {
  const lines: string[] = [
    `Queue snapshot: ${analytics.openTickets} open, ${analytics.closedTickets} closed (${analytics.totalTickets} total)`,
    `Spam: ${analytics.spamCount} (${analytics.spamRate}%)  |  Unassigned: ${analytics.unassignedCount} (${analytics.unassignedRate}%)`,
  ];

  if (analytics.p90ResolutionMinutes != null) {
    lines.push(`Resolution P90: ${analytics.p90ResolutionMinutes}m (${analytics.ticketsAnalyzed} tickets analyzed)`);
  }

  if (analytics.agentBreakdown.length > 0) {
    lines.push("");
    lines.push("Agent workload:");
    for (const agent of analytics.agentBreakdown.slice(0, 5)) {
      lines.push(`  ${agent.agent}: ${agent.ticketCount} tickets`);
    }
  }

  if (analytics.topQuestions.length > 0) {
    lines.push("");
    lines.push("Top categories:");
    for (const q of analytics.topQuestions.slice(0, 5)) {
      lines.push(`  ${q.question}: ${q.count}`);
    }
  }

  return lines.join("\n");
}

export function formatEscalationResult(items: EscalationItem[]): string {
  if (items.length === 0) return "No escalations found. All clear.";

  const lines = [`Found ${items.length} escalation${items.length === 1 ? "" : "s"}:`];

  for (const item of items.slice(0, 10)) {
    const severityIcon = item.severity === "critical" ? "!!" : item.severity === "high" ? "!" : "";
    const assignee = item.assignee
      ? assigneeLabel(item.assignee)
      : "unassigned";
    lines.push(
      `${severityIcon} #${item.ticket_id} — ${item.subject}`,
      `   ${item.reason} | ${assignee} | ${item.age_hours}h old`,
      `   Action: ${item.action}`,
    );
  }

  return lines.join("\n");
}

export function formatWriteConfirmation(description: string): string {
  return `${description}\nReply "yes" to confirm.`;
}
