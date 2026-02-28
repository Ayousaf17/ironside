// Analytics calculator modeled on real Ironside pulse check patterns.
// Separates spam from real support, calculates P50/P90, agent-level metrics.

import type { GorgiasTicket } from "@/lib/gorgias/mock";

export interface AgentMetrics {
  agent: string;
  ticketCount: number;
  closedCount: number;
  closeRate: number; // percentage
}

export interface TicketAnalytics {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  // Spam separation
  spamCount: number;
  spamRate: number; // percentage
  realTickets: number;
  // Resolution times (on closed tickets with agent responses, excluding spam)
  avgResolutionMinutes: number | null;
  p50ResolutionMinutes: number | null;
  p90ResolutionMinutes: number | null;
  ticketsAnalyzed: number;
  // Channels
  ticketsByChannel: Record<string, number>;
  // Workload
  unassignedCount: number;
  unassignedRate: number; // percentage
  agentBreakdown: AgentMetrics[];
  // Top categories (non-spam recurring subjects)
  topQuestions: { question: string; count: number; ticketIds: number[] }[];
  // Tags
  topTags: { tag: string; count: number }[];
}

const SPAM_TAGS = ["auto-close", "non-support-related"];

function isSpam(ticket: GorgiasTicket): boolean {
  return ticket.tags.some((t) => SPAM_TAGS.includes(t));
}

function getResolutionMinutes(ticket: GorgiasTicket): number | null {
  const customerMsg = ticket.messages.find((m) => m.sender.type === "customer");
  const agentMsg = ticket.messages.find((m) => m.sender.type === "agent");
  if (!customerMsg || !agentMsg) return null;
  const diff =
    (new Date(agentMsg.created_datetime).getTime() -
      new Date(customerMsg.created_datetime).getTime()) /
    (1000 * 60);
  return diff >= 0 ? Math.round(diff) : null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function countTags(tickets: GorgiasTicket[]): { tag: string; count: number }[] {
  const tagMap = new Map<string, number>();
  for (const ticket of tickets) {
    for (const tag of ticket.tags) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function groupBySubject(tickets: GorgiasTicket[]): { question: string; count: number; ticketIds: number[] }[] {
  const subjectMap = new Map<string, number[]>();
  for (const ticket of tickets) {
    // Normalize: strip "Re: ", "Fwd: ", and order-specific suffixes
    let subject = ticket.subject
      .replace(/^(Re|Fwd|FW):\s*/gi, "")
      .replace(/Order\s+#?\d+\s*(Update:?\s*)?/gi, "")
      .trim();
    // Group similar subjects
    if (subject.toLowerCase().includes("track order")) subject = "Track Order";
    if (subject.toLowerCase().includes("order verification")) subject = "Order Verification";
    if (subject.toLowerCase().includes("product question")) subject = "Product Question";
    if (subject.toLowerCase().includes("report issue")) subject = "Report Issue";
    if (subject.toLowerCase().includes("new submission from contact")) subject = "New submission from Contact";

    const ids = subjectMap.get(subject) || [];
    ids.push(ticket.id);
    subjectMap.set(subject, ids);
  }
  return Array.from(subjectMap.entries())
    .map(([question, ticketIds]) => ({ question, count: ticketIds.length, ticketIds }))
    .filter((q) => q.count >= 2) // only recurring
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function buildAgentBreakdown(tickets: GorgiasTicket[]): AgentMetrics[] {
  const agentMap = new Map<string, { total: number; closed: number }>();
  for (const ticket of tickets) {
    const agent = ticket.assignee ?? "Unassigned";
    const entry = agentMap.get(agent) || { total: 0, closed: 0 };
    entry.total++;
    if (ticket.status === "closed") entry.closed++;
    agentMap.set(agent, entry);
  }
  return Array.from(agentMap.entries())
    .map(([agent, { total, closed }]) => ({
      agent: agent === "Unassigned" ? "Unassigned" : agent.split("@")[0],
      ticketCount: total,
      closedCount: closed,
      closeRate: total > 0 ? Math.round((closed / total) * 100) : 0,
    }))
    .sort((a, b) => b.ticketCount - a.ticketCount);
}

export function calculateAnalytics(tickets: GorgiasTicket[]): TicketAnalytics {
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const closedTickets = tickets.filter((t) => t.status === "closed").length;

  // Spam separation
  const spamTickets = tickets.filter(isSpam);
  const realTickets = tickets.filter((t) => !isSpam(t));

  // Resolution times — only on non-spam closed tickets with agent responses
  const resolutionTimes: number[] = [];
  for (const ticket of realTickets) {
    if (ticket.status === "closed") {
      const mins = getResolutionMinutes(ticket);
      if (mins !== null) resolutionTimes.push(mins);
    }
  }
  const sorted = [...resolutionTimes].sort((a, b) => a - b);

  // Channels
  const ticketsByChannel: Record<string, number> = {};
  for (const ticket of tickets) {
    ticketsByChannel[ticket.channel] = (ticketsByChannel[ticket.channel] || 0) + 1;
  }

  // Unassigned
  const unassignedCount = tickets.filter((t) => t.assignee === null).length;

  // Top questions (from non-spam only)
  const topQuestions = groupBySubject(realTickets);

  return {
    totalTickets: tickets.length,
    openTickets,
    closedTickets,
    spamCount: spamTickets.length,
    spamRate: tickets.length > 0 ? Math.round((spamTickets.length / tickets.length) * 100) : 0,
    realTickets: realTickets.length,
    avgResolutionMinutes:
      sorted.length > 0
        ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
        : null,
    p50ResolutionMinutes: sorted.length > 0 ? percentile(sorted, 50) : null,
    p90ResolutionMinutes: sorted.length > 0 ? percentile(sorted, 90) : null,
    ticketsAnalyzed: sorted.length,
    ticketsByChannel,
    unassignedCount,
    unassignedRate: tickets.length > 0 ? Math.round((unassignedCount / tickets.length) * 100) : 0,
    agentBreakdown: buildAgentBreakdown(tickets),
    topQuestions,
    topTags: countTags(tickets),
  };
}
