// Wrong category feedback handler — fired when an agent clicks "❌ Wrong category?"
// on an auto-triage card. Opens a modal so they can correct the AI's classification.
// Corrections are stored in AgentBehaviorLog + TicketAnalytics for future tuning.

import { slack, sendSlackBlocks } from "@/lib/slack/client";
import { createBehaviorLog } from "@/lib/repos/agent-behavior-log.repo";
import { prisma } from "@/lib/prisma";

const CATEGORIES = [
  { value: "track_order",         label: "📦 Track Order" },
  { value: "order_verification",  label: "🔍 Order Verification" },
  { value: "return_exchange",     label: "↩️ Return / Exchange" },
  { value: "report_issue",        label: "🔧 Report an Issue" },
  { value: "product_question",    label: "💻 Product Question" },
  { value: "order_change_cancel", label: "✏️ Order Change / Cancel" },
  { value: "contact_form",        label: "📬 Contact Form" },
  { value: "other",               label: "❓ Other" },
];

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

// Opens a modal asking the agent to pick the correct category.
// Called synchronously (trigger_id expires in ~3s).
export async function handleWrongCategoryFeedback({
  triggerId,
  ticketId,
  aiCategory,
  ticketSubject,
  opsChannel,
}: {
  triggerId: string;
  ticketId: number;
  aiCategory: string;
  ticketSubject: string;
  opsChannel?: string;
}): Promise<void> {
  const options = CATEGORIES.map((c) => ({
    text: { type: "plain_text" as const, text: c.label },
    value: c.value,
  }));

  await slack.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "category_correction_modal",
      private_metadata: JSON.stringify({ ticketId, aiCategory, ticketSubject, opsChannel }),
      title: { type: "plain_text", text: "Correct Category" },
      submit: { type: "plain_text", text: "Submit" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Ticket #${ticketId}* — ${ticketSubject.slice(0, 60)}\n\nAI classified this as *${categoryLabel(aiCategory)}*.\nWhat's the correct category?`,
          },
        },
        {
          type: "input",
          block_id: "category_input",
          label: { type: "plain_text", text: "Correct category" },
          element: {
            type: "static_select",
            action_id: "correct_category",
            placeholder: { type: "plain_text", text: "Select the right category…" },
            options,
          },
        },
      ],
    },
  });
}

// Handles the modal submission. Logs the correction and posts a confirmation.
// Called via after() — modal is already closed before this runs.
export async function handleCategoryCorrectionSubmit({
  viewPayload,
  slackUserId,
}: {
  viewPayload: {
    private_metadata: string;
    state: { values: Record<string, Record<string, { selected_option?: { value: string } | null }>> };
  };
  slackUserId: string;
}): Promise<void> {
  const { ticketId, aiCategory, ticketSubject, opsChannel } = JSON.parse(
    viewPayload.private_metadata
  ) as { ticketId: number; aiCategory: string; ticketSubject: string; opsChannel?: string };

  const correctCategory =
    viewPayload.state.values.category_input?.correct_category?.selected_option?.value ?? "other";

  // Log correction to behavior_logs (fire-and-forget)
  createBehaviorLog({
    agent: `slack:${slackUserId}`,
    action: "category_correction",
    ticketId,
    ticketSubject,
    category: correctCategory,
    tagsApplied: [],
    reopened: false,
    rawEvent: {
      source: "slack_interactivity",
      action: "category_correction_modal",
      slackUserId,
      aiCategory,
      correctCategory,
    },
    occurredAt: new Date(),
  }).catch((err) => console.error(`[wrong-category] Log failed for #${ticketId}:`, err));

  // Record human classification in TicketAnalytics (fire-and-forget)
  prisma.ticketAnalytics
    .upsert({
      where: { ticketId },
      create: {
        ticketId,
        category: aiCategory,
        aiClassification: aiCategory,
        humanClassification: correctCategory,
        aiMatchesHuman: aiCategory === correctCategory,
      },
      update: {
        humanClassification: correctCategory,
        aiMatchesHuman: aiCategory === correctCategory,
      },
    })
    .catch((err) => console.error(`[wrong-category] TicketAnalytics upsert failed:`, err));

  // Post confirmation to #ops
  const channel = opsChannel ?? process.env.SLACK_CHANNEL_OPS ?? process.env.SLACK_CHANNEL_ID;
  if (!channel) return;

  await sendSlackBlocks(
    `📝 Category correction on #${ticketId}`,
    [{
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `📝 <@${slackUserId}> corrected *#${ticketId}*: AI said *${categoryLabel(aiCategory)}* → should be *${categoryLabel(correctCategory)}*. Logged for future tuning.`,
      }],
    }],
    channel,
  );
}
