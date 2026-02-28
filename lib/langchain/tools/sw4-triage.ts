// SW4 Auto-Triage Tool — Classify, tag, and route tickets automatically.
// n8n equivalent: would be a combination of IF/Switch nodes + Gorgias update nodes.
//
// Operations:
//   classify_ticket  — detect category + spam, suggest tags and priority
//   auto_route       — assign ticket to best-fit agent based on category
//   bulk_triage      — triage all unassigned open tickets at once

import { DynamicTool } from "@langchain/core/tools";
import { getTicket, searchTickets, updateTags, assignTicket, setStatus } from "@/lib/gorgias/client";

// Spam detection patterns from real Ironside data (Jan-Feb 2026)
const SPAM_PATTERNS = [
  /business\s*(funding|loan|capital)/i,
  /pre-?approv(al|ed)/i,
  /mr\.?\s*charles/i,
  /reply\s*asap/i,
  /quarantine\s*inbox/i,
  /protected\s*audio/i,
  /annual\s*leave\s*compliance/i,
  /steel\s*products/i,
  /account\s*notification.*!!!/i,
  /upgrade.*wallet/i,
  /\b\d+x\s+(HP|Lenovo|Fujitsu|Dell)\b/i, // bulk hardware solicitations
  /payment.*invoice.*secured/i,
  /cease\s*and\s*desist/i,
];

// Category detection from subject + message content
interface TicketClassification {
  category: "track_order" | "order_verification" | "product_question" | "report_issue" | "return_exchange" | "order_change_cancel" | "contact_form" | "spam" | "other";
  suggestedTags: string[];
  suggestedPriority: "critical" | "high" | "normal" | "low";
  suggestedAgent: string | null;
  reason: string;
}

// Agent routing based on real workload patterns
const AGENT_ROUTING: Record<string, string> = {
  track_order: "spencer@ironsidecomputers.com",
  order_verification: "danni-jean@ironsidecomputers.com",
  product_question: "spencer@ironsidecomputers.com",
  report_issue: "spencer@ironsidecomputers.com",
  return_exchange: "danni-jean@ironsidecomputers.com",
  order_change_cancel: "danni-jean@ironsidecomputers.com",
  contact_form: "spencer@ironsidecomputers.com",
};

function classifyTicket(subject: string, messageText: string): TicketClassification {
  const combined = `${subject} ${messageText}`.toLowerCase();

  // Check spam first
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(subject) || pattern.test(messageText)) {
      return {
        category: "spam",
        suggestedTags: ["auto-close", "non-support-related"],
        suggestedPriority: "low",
        suggestedAgent: null,
        reason: `Matched spam pattern: ${pattern.source}`,
      };
    }
  }

  // Water cooling / coolant leak = CRITICAL
  if (/water\s*cool|coolant|leak|drip/i.test(combined)) {
    return {
      category: "report_issue",
      suggestedTags: ["urgent"],
      suggestedPriority: "critical",
      suggestedAgent: "spencer@ironsidecomputers.com",
      reason: "Water cooling issue detected — potential hardware damage",
    };
  }

  // DOA / dead on arrival
  if (/\b(doa|dead on arrival|won'?t (turn on|power|boot)|no power)\b/i.test(combined)) {
    return {
      category: "report_issue",
      suggestedTags: ["urgent"],
      suggestedPriority: "critical",
      suggestedAgent: "spencer@ironsidecomputers.com",
      reason: "DOA / no power issue — critical hardware failure",
    };
  }

  // Track Order
  if (/track\s*order|order\s*status|where.?s my (order|build|pc)|shipping\s*(update|confirmation)|when.*(ship|arrive|deliver)/i.test(combined) ||
      /stage\s*\d|build\s*(queue|progress|update)/i.test(combined)) {
    const isOverdue = /(\d{2,})\s*days/i.test(combined) || /overdue|past\s*due|too\s*long|ridiculous|dispute/i.test(combined);
    return {
      category: "track_order",
      suggestedTags: ["ORDER-STATUS", ...(isOverdue ? ["urgent"] : [])],
      suggestedPriority: isOverdue ? "high" : "normal",
      suggestedAgent: AGENT_ROUTING.track_order,
      reason: isOverdue ? "Order status inquiry — customer indicates overdue" : "Standard order status inquiry",
    };
  }

  // Order Verification
  if (/order\s*verification|verify\s*(my|the|your)\s*order|verification\s*(document|needed|required)|send.*id|proof\s*of\s*address/i.test(combined)) {
    const isStuck = /(3|4|5|6|7)\+?\s*days?\s*ago|still\s*(waiting|pending)|already\s*sent/i.test(combined);
    return {
      category: "order_verification",
      suggestedTags: ["ORDER-STATUS", ...(isStuck ? ["urgent"] : [])],
      suggestedPriority: isStuck ? "high" : "normal",
      suggestedAgent: AGENT_ROUTING.order_verification,
      reason: isStuck ? "Verification stuck — customer already submitted docs" : "Standard verification inquiry",
    };
  }

  // Return / Exchange
  if (/\b(return|exchange|rma|refund|send\s*(it\s*)?back|wrong\s*(item|size|product))\b/i.test(combined)) {
    return {
      category: "return_exchange",
      suggestedTags: ["RETURN/EXCHANGE"],
      suggestedPriority: "normal",
      suggestedAgent: AGENT_ROUTING.return_exchange,
      reason: "Return or exchange request",
    };
  }

  // Order Cancel / Change
  if (/\b(cancel|cancellation|change\s*my\s*order|modify\s*order)\b/i.test(combined)) {
    return {
      category: "order_change_cancel",
      suggestedTags: ["ORDER-CHANGE/CANCEL"],
      suggestedPriority: "normal",
      suggestedAgent: AGENT_ROUTING.order_change_cancel,
      reason: "Order change or cancellation request",
    };
  }

  // Report Issue / Technical
  if (/\b(report\s*issue|not\s*working|broken|defective|crash|blue\s*screen|bsod|driver|wifi|lan|ethernet|rgb|fan|noise|overheat|temperature)\b/i.test(combined)) {
    const isDriverIssue = /wifi|lan|driver|network\s*adapter/i.test(combined);
    return {
      category: "report_issue",
      suggestedTags: ["urgent"],
      suggestedPriority: "high",
      suggestedAgent: AGENT_ROUTING.report_issue,
      reason: isDriverIssue ? "Driver/connectivity issue — common post-delivery problem" : "Hardware or software issue reported",
    };
  }

  // Product Question
  if (/\b(product\s*question|upgrade|specs?|compatibility|can\s*i\s*(add|upgrade|change|use)|difference\s*between|which\s*(one|model|build)|recommend|price|cost)\b/i.test(combined)) {
    return {
      category: "product_question",
      suggestedTags: [],
      suggestedPriority: "normal",
      suggestedAgent: AGENT_ROUTING.product_question,
      reason: "Pre-sale product inquiry",
    };
  }

  // Contact Form
  if (/new\s*submission\s*from\s*contact/i.test(subject)) {
    return {
      category: "contact_form",
      suggestedTags: [],
      suggestedPriority: "normal",
      suggestedAgent: AGENT_ROUTING.contact_form,
      reason: "Contact form submission — needs manual review",
    };
  }

  return {
    category: "other",
    suggestedTags: [],
    suggestedPriority: "normal",
    suggestedAgent: null,
    reason: "Could not auto-classify — needs manual review",
  };
}

export const sw4TriageTool = new DynamicTool({
  name: "sw4_auto_triage",
  description:
    "Auto-classify, tag, and route support tickets. " +
    "Input must be a JSON string with: operation (string). " +
    "Operations: " +
    'classify_ticket (requires ticket_id) — detect category, suggest tags/priority/agent, ' +
    'auto_route (requires ticket_id) — classify AND apply tags + assign agent, ' +
    'bulk_triage — triage all unassigned open tickets at once. ' +
    'Examples: {"operation": "classify_ticket", "ticket_id": 254126423}, ' +
    '{"operation": "auto_route", "ticket_id": 254126423}, ' +
    '{"operation": "bulk_triage"}',
  func: async (input: string) => {
    try {
      const params = JSON.parse(input);

      switch (params.operation) {
        case "classify_ticket": {
          if (!params.ticket_id) {
            return JSON.stringify({ error: "classify_ticket requires ticket_id" });
          }
          const ticket = await getTicket(Number(params.ticket_id));
          if (!ticket) return JSON.stringify({ error: `Ticket ${params.ticket_id} not found` });

          const firstMessage = ticket.messages[0]?.body_text || "";
          const classification = classifyTicket(ticket.subject, firstMessage);

          return JSON.stringify({
            ticket_id: ticket.id,
            subject: ticket.subject,
            current_status: ticket.status,
            current_assignee: ticket.assignee,
            current_tags: ticket.tags,
            classification,
          }, null, 2);
        }

        case "auto_route": {
          if (!params.ticket_id) {
            return JSON.stringify({ error: "auto_route requires ticket_id" });
          }
          const ticket = await getTicket(Number(params.ticket_id));
          if (!ticket) return JSON.stringify({ error: `Ticket ${params.ticket_id} not found` });

          const firstMessage = ticket.messages[0]?.body_text || "";
          const classification = classifyTicket(ticket.subject, firstMessage);
          const actions: string[] = [];

          // Apply tags if we have suggestions and ticket doesn't already have them
          if (classification.suggestedTags.length > 0) {
            const newTags = [...new Set([...ticket.tags, ...classification.suggestedTags])];
            if (newTags.length !== ticket.tags.length || !newTags.every(t => ticket.tags.includes(t))) {
              await updateTags(ticket.id, newTags);
              actions.push(`Tagged: [${classification.suggestedTags.join(", ")}]`);
            }
          }

          // Auto-close spam
          if (classification.category === "spam" && ticket.status === "open") {
            await setStatus(ticket.id, "closed");
            actions.push("Auto-closed as spam");
          }

          // Assign agent if unassigned
          if (!ticket.assignee && classification.suggestedAgent) {
            await assignTicket(ticket.id, classification.suggestedAgent);
            actions.push(`Assigned to ${classification.suggestedAgent.split("@")[0]}`);
          }

          return JSON.stringify({
            ticket_id: ticket.id,
            subject: ticket.subject,
            classification,
            actions_taken: actions.length > 0 ? actions : ["No actions needed — ticket already triaged"],
          }, null, 2);
        }

        case "bulk_triage": {
          const openUnassigned = await searchTickets({ status: "open" });
          const unassigned = openUnassigned.filter(t => t.assignee === null);

          if (unassigned.length === 0) {
            return JSON.stringify({ message: "No unassigned open tickets to triage", triaged: 0 });
          }

          const results = [];
          for (const ticket of unassigned) {
            const firstMessage = ticket.messages[0]?.body_text || "";
            const classification = classifyTicket(ticket.subject, firstMessage);
            const actions: string[] = [];

            // Apply tags
            if (classification.suggestedTags.length > 0) {
              const newTags = [...new Set([...ticket.tags, ...classification.suggestedTags])];
              if (newTags.length !== ticket.tags.length || !newTags.every(t => ticket.tags.includes(t))) {
                await updateTags(ticket.id, newTags);
                actions.push(`Tagged: [${classification.suggestedTags.join(", ")}]`);
              }
            }

            // Auto-close spam
            if (classification.category === "spam" && ticket.status === "open") {
              await setStatus(ticket.id, "closed");
              actions.push("Auto-closed as spam");
            }

            // Assign agent
            if (classification.suggestedAgent) {
              await assignTicket(ticket.id, classification.suggestedAgent);
              actions.push(`Assigned to ${classification.suggestedAgent.split("@")[0]}`);
            }

            results.push({
              ticket_id: ticket.id,
              subject: ticket.subject,
              category: classification.category,
              priority: classification.suggestedPriority,
              actions,
            });
          }

          const spamClosed = results.filter(r => r.category === "spam").length;
          const assigned = results.filter(r => r.actions.some(a => a.startsWith("Assigned"))).length;

          return JSON.stringify({
            triaged: results.length,
            spam_closed: spamClosed,
            assigned,
            details: results,
          }, null, 2);
        }

        default:
          return JSON.stringify({
            error: `Unknown operation: ${params.operation}`,
            valid_operations: ["classify_ticket", "auto_route", "bulk_triage"],
          });
      }
    } catch (err) {
      return JSON.stringify({ error: `Triage failed: ${err}` });
    }
  },
});
