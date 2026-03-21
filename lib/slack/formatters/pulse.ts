import { headerBlock, contextBlock, metricLine, actionRow } from "@/lib/slack/blocks";
import type { PulseCheckBlocksInput } from "@/lib/slack/formatters";

export function formatPulseCheckBlocks(input: PulseCheckBlocksInput): object[] {
  const { analytics, dateRangeEnd } = input;

  // Format date as "Mar 21"
  const dateLabel = dateRangeEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const blocks: object[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  blocks.push(headerBlock(`📊  Daily Pulse  ·  ${dateLabel}`));

  // ── Ticket counts + P90 ─────────────────────────────────────────────────────
  const countLine = `${analytics.openTickets} open  ·  ${analytics.closedTickets} closed  ·  ${analytics.spamCount} spam auto-closed`;

  let p90Line: string;
  if (analytics.p90ResolutionMinutes !== null) {
    p90Line = metricLine("P90", `${analytics.p90ResolutionMinutes} min`);
  } else {
    p90Line = "*P90:* –";
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${countLine}\n${p90Line}`,
    },
  });

  // ── Top category + unassigned ────────────────────────────────────────────────
  const insightLines: string[] = [];

  if (analytics.topQuestions.length > 0) {
    const top = analytics.topQuestions[0];
    insightLines.push(`🔥  *Top category:* ${top.question} (${top.count} ticket${top.count !== 1 ? "s" : ""})`);
  }

  if (analytics.unassignedCount > 0) {
    insightLines.push(`⚠️  *${analytics.unassignedCount} unassigned* — need routing`);
  }

  if (insightLines.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: insightLines.join("\n"),
      },
    });
  }

  // ── Dashboard button ─────────────────────────────────────────────────────────
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://ironside-alpha.vercel.app";

  blocks.push(
    actionRow([
      {
        text: "View Dashboard →",
        actionId: "open_dashboard",
        value: JSON.stringify({ url: `${baseUrl}/dashboard` }),
      },
    ])
  );

  return blocks;
}
