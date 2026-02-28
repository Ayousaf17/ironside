// SW6 Escalation Monitor — Scan for tickets that need immediate attention.
// n8n equivalent: would be a scheduled trigger + IF conditions + Slack alerts.
//
// Operations:
//   scan_aging      — find tickets open longer than threshold (default 4 hours)
//   scan_critical   — find tickets matching critical escalation patterns
//   scan_overdue    — find order tickets past the 15-20 day build window
//   full_scan       — run all scans at once and produce a prioritized action list

import { DynamicTool } from "@langchain/core/tools";
import { searchTickets } from "@/lib/gorgias/client";
import type { GorgiasTicket } from "@/lib/gorgias/mock";

interface EscalationItem {
  ticket_id: number;
  subject: string;
  severity: "critical" | "high" | "medium";
  reason: string;
  assignee: string | null;
  age_hours: number;
  customer_name: string;
  action: string;
}

function getTicketAgeHours(ticket: GorgiasTicket): number {
  const created = new Date(ticket.created_datetime).getTime();
  return Math.round((Date.now() - created) / (1000 * 60 * 60));
}

function getCustomerName(ticket: GorgiasTicket): string {
  const customerMsg = ticket.messages.find(m => m.sender.type === "customer");
  return customerMsg?.sender.name || "Unknown";
}

function hasAgentResponse(ticket: GorgiasTicket): boolean {
  return ticket.messages.some(m => m.sender.type === "agent");
}

// Critical patterns that always need immediate attention
const CRITICAL_PATTERNS = [
  { pattern: /water\s*cool|coolant|leak|drip/i, reason: "Water cooling leak — potential hardware damage" },
  { pattern: /\b(doa|dead on arrival|won'?t (turn on|power|boot)|no power)\b/i, reason: "DOA / system won't power on" },
  { pattern: /\b(fire|smoke|burning|smell|spark)\b/i, reason: "Safety hazard reported" },
  { pattern: /\b(chargeback|dispute|fraud|attorney|lawyer|bbb|better business)\b/i, reason: "Legal/chargeback threat" },
];

function scanAging(tickets: GorgiasTicket[], thresholdHours: number): EscalationItem[] {
  const results: EscalationItem[] = [];
  for (const ticket of tickets) {
    if (ticket.status !== "open") continue;
    const ageHours = getTicketAgeHours(ticket);
    if (ageHours < thresholdHours) continue;
    // Skip spam
    if (ticket.tags.some(t => t === "auto-close" || t === "non-support-related")) continue;

    const noResponse = !hasAgentResponse(ticket);
    results.push({
      ticket_id: ticket.id,
      subject: ticket.subject,
      severity: ageHours > 24 ? "high" : "medium",
      reason: noResponse
        ? `Open ${ageHours}h with NO agent response`
        : `Open ${ageHours}h — may need follow-up`,
      assignee: ticket.assignee,
      age_hours: ageHours,
      customer_name: getCustomerName(ticket),
      action: noResponse
        ? (ticket.assignee ? `Ping ${ticket.assignee.split("@")[0]} for response` : "Assign and respond immediately")
        : "Check if customer is waiting on a follow-up",
    });
  }
  return results.sort((a, b) => b.age_hours - a.age_hours);
}

function scanCritical(tickets: GorgiasTicket[]): EscalationItem[] {
  const results: EscalationItem[] = [];
  for (const ticket of tickets) {
    if (ticket.status !== "open") continue;
    const combined = `${ticket.subject} ${ticket.messages.map(m => m.body_text).join(" ")}`;
    for (const { pattern, reason } of CRITICAL_PATTERNS) {
      if (pattern.test(combined)) {
        results.push({
          ticket_id: ticket.id,
          subject: ticket.subject,
          severity: "critical",
          reason,
          assignee: ticket.assignee,
          age_hours: getTicketAgeHours(ticket),
          customer_name: getCustomerName(ticket),
          action: ticket.assignee
            ? `Escalate to senior tech — currently with ${ticket.assignee.split("@")[0]}`
            : "ASSIGN IMMEDIATELY to Spencer (senior agent) — critical issue",
        });
        break; // one match per ticket is enough
      }
    }
  }
  return results;
}

function scanOverdue(tickets: GorgiasTicket[]): EscalationItem[] {
  const results: EscalationItem[] = [];
  const BUILD_WINDOW_DAYS = 20; // 15-20 business days, use 20 as threshold

  for (const ticket of tickets) {
    if (ticket.status !== "open") continue;
    // Look for order-related tickets
    if (!ticket.tags.includes("ORDER-STATUS") &&
        !/track\s*order|order\s*status|order\s*\d+/i.test(ticket.subject)) continue;

    const combined = `${ticket.subject} ${ticket.messages.map(m => m.body_text).join(" ")}`;

    // Check for explicit day counts mentioned by customer
    const dayMatch = combined.match(/(\d{2,})\s*days?\b/);
    const mentionedDays = dayMatch ? parseInt(dayMatch[1]) : 0;

    // Check for frustration indicators
    const isFrustrated = /ridiculous|unacceptable|dispute|chargeback|cancel|furious|terrible|worst/i.test(combined);

    if (mentionedDays >= BUILD_WINDOW_DAYS || isFrustrated) {
      results.push({
        ticket_id: ticket.id,
        subject: ticket.subject,
        severity: isFrustrated ? "high" : "medium",
        reason: mentionedDays >= BUILD_WINDOW_DAYS
          ? `Customer reports ${mentionedDays}-day wait — past ${BUILD_WINDOW_DAYS}-day build window`
          : "Customer expressing strong frustration with order timeline",
        assignee: ticket.assignee,
        age_hours: getTicketAgeHours(ticket),
        customer_name: getCustomerName(ticket),
        action: "Escalate to build team for priority status check. Use 'order_status_overdue' template.",
      });
    }
  }
  return results;
}

export const sw6EscalationTool = new DynamicTool({
  name: "sw6_escalation_monitor",
  description:
    "Scan support tickets for escalation needs — aging tickets, critical issues, overdue orders. " +
    "Input must be a JSON string with: operation (string). " +
    "Operations: " +
    "scan_aging (optional threshold_hours, default 4) — find tickets open too long without response, " +
    "scan_critical — find tickets matching critical patterns (leaks, DOA, safety, legal threats), " +
    "scan_overdue — find order tickets past the 15-20 day build window, " +
    "full_scan — run all scans and produce a prioritized action list. " +
    'Examples: {"operation": "scan_aging", "threshold_hours": 8}, ' +
    '{"operation": "scan_critical"}, ' +
    '{"operation": "full_scan"}',
  func: async (input: string) => {
    try {
      const params = JSON.parse(input);
      const tickets = await searchTickets({});

      switch (params.operation) {
        case "scan_aging": {
          const threshold = params.threshold_hours ?? 4;
          const aging = scanAging(tickets, threshold);
          return JSON.stringify({
            scan: "aging",
            threshold_hours: threshold,
            found: aging.length,
            escalations: aging,
          }, null, 2);
        }

        case "scan_critical": {
          const critical = scanCritical(tickets);
          return JSON.stringify({
            scan: "critical",
            found: critical.length,
            escalations: critical,
          }, null, 2);
        }

        case "scan_overdue": {
          const overdue = scanOverdue(tickets);
          return JSON.stringify({
            scan: "overdue",
            found: overdue.length,
            escalations: overdue,
          }, null, 2);
        }

        case "full_scan": {
          const threshold = params.threshold_hours ?? 4;
          const critical = scanCritical(tickets);
          const overdue = scanOverdue(tickets);
          const aging = scanAging(tickets, threshold);

          // Deduplicate — if a ticket is in critical or overdue, remove from aging
          const criticalIds = new Set([...critical, ...overdue].map(e => e.ticket_id));
          const agingOnly = aging.filter(e => !criticalIds.has(e.ticket_id));

          const all = [...critical, ...overdue, ...agingOnly];
          const severityOrder = { critical: 0, high: 1, medium: 2 };
          all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

          return JSON.stringify({
            scan: "full",
            summary: {
              critical: critical.length,
              overdue_orders: overdue.length,
              aging_tickets: agingOnly.length,
              total_escalations: all.length,
            },
            escalations: all,
          }, null, 2);
        }

        default:
          return JSON.stringify({
            error: `Unknown operation: ${params.operation}`,
            valid_operations: ["scan_aging", "scan_critical", "scan_overdue", "full_scan"],
          });
      }
    } catch (err) {
      return JSON.stringify({ error: `Escalation scan failed: ${err}` });
    }
  },
});
