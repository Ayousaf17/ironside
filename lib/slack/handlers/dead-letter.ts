// Dead letter handler — posts a Slack alert when a webhook event fails to process.
// Ensures no silent failures: ops team sees every dropped event in the alerts channel.

import { sendSlackBlocks } from "@/lib/slack/client";

export async function notifyDeadLetter({
  eventType,
  ticketId,
  error,
}: {
  eventType: string;
  ticketId: string | number;
  error: string;
}): Promise<void> {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "⚠️ Webhook Event Failed", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Event:*\n${eventType}` },
        { type: "mrkdwn", text: `*Ticket:*\n#${ticketId}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Error:*\n\`\`\`${error.slice(0, 500)}\`\`\`` },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Failed at ${new Date().toISOString()} — check Vercel logs for full trace`,
        },
      ],
    },
  ];

  await sendSlackBlocks(
    `⚠️ Webhook processing failed for ${eventType} on ticket #${ticketId}`,
    blocks,
    undefined,
    undefined,
    "alerts",
  );
}
