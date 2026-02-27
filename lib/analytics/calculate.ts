// Pure TypeScript analytics calculator — port of the n8n Calculate Analytics code node.

import type { GorgiasTicket } from "@/lib/gorgias/mock";

export interface TicketAnalytics {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  avgResponseTimeMinutes: number | null;
  ticketsByChannel: Record<string, number>;
  ticketsByStatus: Record<string, number>;
  unassignedCount: number;
  topTags: { tag: string; count: number }[];
}

function calculateAvgResponseTime(tickets: GorgiasTicket[]): number | null {
  const responseTimes: number[] = [];
  for (const ticket of tickets) {
    const customerMsg = ticket.messages.find((m) => m.sender.type === "customer");
    const agentMsg = ticket.messages.find((m) => m.sender.type === "agent");
    if (customerMsg && agentMsg) {
      const diffMinutes =
        (new Date(agentMsg.created_datetime).getTime() -
          new Date(customerMsg.created_datetime).getTime()) /
        (1000 * 60);
      if (diffMinutes >= 0) responseTimes.push(diffMinutes);
    }
  }
  if (responseTimes.length === 0) return null;
  return Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
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

export function calculateAnalytics(tickets: GorgiasTicket[]): TicketAnalytics {
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const closedTickets = tickets.filter((t) => t.status === "closed").length;

  const ticketsByChannel: Record<string, number> = {};
  for (const ticket of tickets) {
    ticketsByChannel[ticket.channel] = (ticketsByChannel[ticket.channel] || 0) + 1;
  }

  const ticketsByStatus: Record<string, number> = {};
  for (const ticket of tickets) {
    ticketsByStatus[ticket.status] = (ticketsByStatus[ticket.status] || 0) + 1;
  }

  return {
    totalTickets: tickets.length,
    openTickets,
    closedTickets,
    avgResponseTimeMinutes: calculateAvgResponseTime(tickets),
    ticketsByChannel,
    ticketsByStatus,
    unassignedCount: tickets.filter((t) => t.assignee === null).length,
    topTags: countTags(tickets),
  };
}
