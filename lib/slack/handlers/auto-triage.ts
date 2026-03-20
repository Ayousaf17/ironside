// Auto-triage handler — fires on every ticket-created webhook event.
// Classifies the ticket, applies tags + assignment in Gorgias,
// then posts a Slack card to #ops with a reply preview.

import { classifyTicket } from "@/lib/langchain/tools/sw4-triage";
import { TEMPLATES, fillTemplate } from "@/lib/langchain/tools/sw5-templates";
import { updateTags, assignTicket, setStatus } from "@/lib/gorgias/client";
import { sendSlackBlocks } from "@/lib/slack/client";
import type { GorgiasHttpIntegrationPayload } from "@/lib/gorgias/events";

// Default template per category
const CATEGORY_TEMPLATE: Record<string, string | null> = {
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

const NO_TEMPLATE_TEXT = "No template for this category — draft a custom response.";

// SLA targets per priority (minutes)
const SLA_TARGETS: Record<string, number> = {
  critical: 30,
  high: 120,
  normal: 240,
  low: 480,
};

function formatSlaText(priority: string): string {
  const targetMin = SLA_TARGETS[priority];
  if (!targetMin) return "";
  if (targetMin < 60) return `${targetMin}m`;
  return `${Math.floor(targetMin / 60)}h`;
}

function parseTags(tagsField: unknown): string[] {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField.map(String);
  const str = String(tagsField);
  if (!str || str === "[]" || str === "None") return [];
  return str.split(",").map((t) => t.replace(/[[\]']/g, "").trim()).filter(Boolean);
}

function previewBody(body: string, maxChars = 300): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) return trimmed;
  // Cut at last sentence boundary within limit
  const cut = trimmed.slice(0, maxChars);
  const lastDot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (lastDot > 100 ? cut.slice(0, lastDot + 1) : cut) + "…";
}

export async function handleAutoTriage(payload: GorgiasHttpIntegrationPayload): Promise<void> {
  const ticketId = Number(payload.ticket_id) || 0;
  if (!ticketId) return;

  const subject = payload.subject ?? "(no subject)";
  const lastMessage = payload.last_message ?? "";
  const customerName = payload.customer_name ?? "there";
  const existingTags = parseTags(payload.tags);

  const classification = await classifyTicket(subject, lastMessage);

  // Spam → auto-close AND notify #ops so you can reopen false positives
  if (classification.category === "spam") {
    await setStatus(ticketId, "closed");
    console.log(`[auto-triage] Ticket #${ticketId} auto-closed as spam`);
    await sendSlackBlocks(
      `🗑️ Auto-closed spam ticket #${ticketId}`,
      [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🗑️ *Auto-closed as spam — Ticket #${ticketId}*\n${subject}\n_Reason: ${classification.reason}_\n\nIf this was a real customer, reopen it in Gorgias.`,
        },
      }],
      undefined, undefined, "ops",
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

  // Build reply preview
  const templateId = CATEGORY_TEMPLATE[classification.category];
  const template = templateId ? TEMPLATES.find((t) => t.id === templateId) : null;
  const replyPreview = template
    ? previewBody(fillTemplate(template, customerName.split(" ")[0]).body)
    : NO_TEMPLATE_TEXT;

  const emoji = PRIORITY_EMOJI[classification.suggestedPriority] ?? "🎫";
  const categoryDisplay = classification.category.replace(/_/g, " ");
  const assignedTo = classification.suggestedAgent
    ? classification.suggestedAgent.split("@")[0]
    : payload.assignee_email?.split("@")[0] ?? "—";

  const blocks: object[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *New Ticket #${ticketId}*\n${subject}`,
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "Reply →" },
        action_id: "open_reply_modal",
        value: JSON.stringify({ ticketId, tags: [], subject: subject.slice(0, 100) }),
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Category:*\n${categoryDisplay}` },
        { type: "mrkdwn", text: `*Priority:*\n${classification.suggestedPriority}` },
        { type: "mrkdwn", text: `*Assigned:*\n${assignedTo}` },
        { type: "mrkdwn", text: `*SLA Target:*\n${formatSlaText(classification.suggestedPriority) || "—"}` },
      ],
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `_AI classified because: ${classification.reason}_` }],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Suggested reply:*\n>${replyPreview.replace(/\n/g, "\n>")}`,
      },
    },
    ...(actions.length > 0
      ? [{
          type: "context",
          elements: [{ type: "mrkdwn", text: `_AI actions: ${actions.join(" · ")}_` }],
        }]
      : []),
    {
      type: "actions",
      elements: [{
        type: "button",
        text: { type: "plain_text", text: "❌ Wrong category?" },
        action_id: "wrong_category_feedback",
        value: JSON.stringify({
          ticketId,
          aiCategory: classification.category,
          ticketSubject: subject.slice(0, 100),
        }),
      }],
    },
  ];

  await sendSlackBlocks(
    `${emoji} New ticket #${ticketId}: ${subject}`,
    blocks,
    undefined, undefined, "ops",
  );
}
