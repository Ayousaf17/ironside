// Auto-triage handler — fires on every ticket-created webhook event.
// Classifies the ticket, applies tags + assignment in Gorgias,
// then posts a Slack card to #ops with the suggested template.

import { classifyTicket } from "@/lib/langchain/tools/sw4-triage";
import { updateTags, assignTicket, setStatus } from "@/lib/gorgias/client";
import { sendSlackBlocks } from "@/lib/slack/client";
import type { GorgiasHttpIntegrationPayload } from "@/lib/gorgias/events";

// Best template to suggest per category (shown in Slack card)
const TEMPLATE_HINT: Record<string, string | null> = {
  track_order: "order_status_in_build",
  order_verification: "verification_what_needed",
  return_exchange: "return_process",
  report_issue: "wifi_driver_fix",
  order_change_cancel: null,
  product_question: null,
  contact_form: null,
  spam: null,
  other: null,
};

const PRIORITY_EMOJI: Record<string, string> = {
  critical: "🚨",
  high: "⚠️",
  normal: "🎫",
  low: "📋",
};

function parseTags(tagsField: unknown): string[] {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField.map(String);
  const str = String(tagsField);
  if (!str || str === "[]" || str === "None") return [];
  return str.split(",").map((t) => t.replace(/[[\]']/g, "").trim()).filter(Boolean);
}

export async function handleAutoTriage(payload: GorgiasHttpIntegrationPayload): Promise<void> {
  const ticketId = Number(payload.ticket_id) || 0;
  if (!ticketId) return;

  const subject = payload.subject ?? "(no subject)";
  const lastMessage = payload.last_message ?? "";
  const existingTags = parseTags(payload.tags);

  const classification = await classifyTicket(subject, lastMessage);

  // Spam → auto-close AND notify #ops so you can reopen if it's a false positive
  if (classification.category === "spam") {
    await setStatus(ticketId, "closed");
    console.log(`[auto-triage] Ticket #${ticketId} auto-closed as spam`);
    await sendSlackBlocks(
      `🗑️ Auto-closed spam ticket #${ticketId}`,
      [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🗑️ *Auto-closed as spam — Ticket #${ticketId}*\n${subject}\n_Reason: ${classification.reason}_\n\nIf this was a real customer, reopen it in Gorgias.`,
          },
        },
      ],
      undefined,
      undefined,
      "ops",
    );
    return;
  }

  const actions: string[] = [];

  // Apply new tags if any
  if (classification.suggestedTags.length > 0) {
    const merged = [...new Set([...existingTags, ...classification.suggestedTags])];
    if (merged.length > existingTags.length) {
      await updateTags(ticketId, merged);
      actions.push(`Tagged: ${classification.suggestedTags.join(", ")}`);
    }
  }

  // Assign agent if unassigned
  if (!payload.assignee_email && classification.suggestedAgent) {
    await assignTicket(ticketId, classification.suggestedAgent);
    actions.push(`Assigned → ${classification.suggestedAgent.split("@")[0]}`);
  }

  const emoji = PRIORITY_EMOJI[classification.suggestedPriority] ?? "🎫";
  const categoryDisplay = classification.category.replace(/_/g, " ");
  const templateHint = TEMPLATE_HINT[classification.category];
  const assignedTo = classification.suggestedAgent
    ? classification.suggestedAgent.split("@")[0]
    : payload.assignee_email?.split("@")[0] ?? "—";

  const fields = [
    { type: "mrkdwn", text: `*Category:*\n${categoryDisplay}` },
    { type: "mrkdwn", text: `*Priority:*\n${classification.suggestedPriority}` },
    { type: "mrkdwn", text: `*Assigned:*\n${assignedTo}` },
    ...(templateHint
      ? [{ type: "mrkdwn", text: `*Suggested Template:*\n\`${templateHint}\`` }]
      : []),
  ];

  const blocks: object[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *New Ticket #${ticketId}*\n${subject}`,
      },
    },
    { type: "section", fields },
    ...(actions.length > 0
      ? [{
          type: "context",
          elements: [{ type: "mrkdwn", text: `_AI actions: ${actions.join(" · ")}_` }],
        }]
      : []),
  ];

  await sendSlackBlocks(
    `${emoji} New ticket #${ticketId}: ${subject}`,
    blocks,
    undefined,
    undefined,
    "ops",
  );
}
