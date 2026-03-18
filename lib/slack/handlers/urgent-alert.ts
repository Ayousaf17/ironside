// Urgent ticket alert handler — fires on ticket-created webhook events.
// Detects critical patterns and urgent tags, then posts a Block Kit alert
// to the ALERTS Slack channel with a Reply button.

import { sendSlackBlocks } from "@/lib/slack/client";
import { formatUrgentTicketBlocks } from "@/lib/slack/formatters";
import type { GorgiasHttpIntegrationPayload } from "@/lib/gorgias/events";

// Critical patterns — kept in sync with cron/escalation-scan
const CRITICAL_PATTERNS: { pattern: RegExp; reason: string; severity: "critical" | "high" }[] = [
  { pattern: /water\s*cool|coolant|leak|drip/i,                                      reason: "Water cooling leak",         severity: "critical" },
  { pattern: /\b(doa|dead on arrival|won'?t (turn on|power|boot)|no power)\b/i,     reason: "DOA / no power",             severity: "critical" },
  { pattern: /\b(fire|smoke|burning|smell|spark)\b/i,                               reason: "Safety hazard",              severity: "critical" },
  { pattern: /\b(chargeback|dispute|fraud|attorney|lawyer|bbb)\b/i,                 reason: "Legal/chargeback threat",    severity: "high"     },
];

// Tags that always trigger an alert regardless of subject
const URGENT_TAGS = ["urgent", "escalated", "vip", "angry-customer"];

export function detectUrgency(
  subject: string,
  tags: string[],
  body?: string,
): { reason: string; severity: "critical" | "high" } | null {
  const combined = `${subject} ${body ?? ""}`;

  for (const { pattern, reason, severity } of CRITICAL_PATTERNS) {
    if (pattern.test(combined)) return { reason, severity };
  }

  const normalizedTags = tags.map((t) => t.toLowerCase());
  const urgentTag = normalizedTags.find((t) => URGENT_TAGS.includes(t));
  if (urgentTag) return { reason: `Tagged as ${urgentTag}`, severity: "high" };

  return null;
}

function parseTags(tagsField: unknown): string[] {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField.map(String);
  const str = String(tagsField);
  if (!str || str === "[]" || str === "None") return [];
  return str.split(",").map((t) => t.replace(/[[\]']/g, "").trim()).filter(Boolean);
}

export async function handleNewTicketAlert(payload: GorgiasHttpIntegrationPayload): Promise<void> {
  const ticketId = Number(payload.ticket_id) || 0;
  const subject = payload.subject ?? "";
  const tags = parseTags(payload.tags);
  const body = payload.last_message ?? "";

  const urgency = detectUrgency(subject, tags, body);
  if (!urgency) return;

  console.log(`[urgent-alert] Ticket #${ticketId} is ${urgency.severity}: ${urgency.reason}`);

  const blocks = formatUrgentTicketBlocks({
    ticketId,
    subject,
    tags,
    customerName: payload.customer_name ?? "Unknown",
    channel: payload.channel ?? "email",
    urgencyReason: urgency.reason,
    severity: urgency.severity,
  });

  await sendSlackBlocks(
    `${urgency.severity === "critical" ? "🚨" : "⚠️"} Urgent ticket #${ticketId}: ${subject}`,
    blocks,
    undefined,
    undefined,
    "alerts",
  );
}
