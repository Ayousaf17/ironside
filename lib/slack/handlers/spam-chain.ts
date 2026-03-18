// Spam chain handlers — called from the Slack interactivity route via after().
// Flow: show_spam_tickets → close_all_spam (or cancel_spam_review)
//
// Concurrency: The first action immediately calls response_url to replace the
// original message with a locked state, removing buttons so teammates can't
// double-click the same action.

import { getTickets } from "@/lib/gorgias/client";
import { updateTags, setStatus } from "@/lib/gorgias/client";
import { sendSlackBlocks, callResponseUrl } from "@/lib/slack/client";
import { formatSpamChainBlocks } from "@/lib/slack/formatters";
import { createBehaviorLog } from "@/lib/repos/agent-behavior-log.repo";
import { withRetry } from "@/lib/services/retry.service";

const SPAM_TAGS = ["auto-close", "non-support-related"];

interface GorgiasTicketMin {
  id: number;
  subject: string;
  status: "open" | "closed";
  tags: string[];
  created_datetime: string;
}

function isSpam(ticket: GorgiasTicketMin): boolean {
  return ticket.tags.some((t) => SPAM_TAGS.includes(t));
}

async function fetchOpenSpamTickets(): Promise<GorgiasTicketMin[]> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tickets = await getTickets({ updatedAfter: twentyFourHoursAgo });
  return tickets.filter((t) => t.status === "open" && isSpam(t));
}

function lockedBlock(text: string): object[] {
  return [{ type: "section", text: { type: "mrkdwn", text } }];
}

export async function handleShowSpamTickets({
  responseUrl,
  slackUserId,
  channel,
}: {
  responseUrl: string;
  slackUserId: string;
  channel: string;
}): Promise<void> {
  // 1. Lock the pulse check message immediately — removes buttons for everyone
  await callResponseUrl(responseUrl, {
    text: `🔒 <@${slackUserId}> is reviewing spam tickets...`,
    blocks: lockedBlock(
      `🔒 *<@${slackUserId}> is reviewing the spam queue...*\nSpam chain will appear below shortly.`
    ),
    replace_original: true,
  });

  // 2. Fetch open spam tickets from Gorgias
  const spamTickets = await fetchOpenSpamTickets();

  if (spamTickets.length === 0) {
    await sendSlackBlocks(
      "✅ No open spam tickets — queue is clean!",
      lockedBlock("✅ *No open spam tickets found* — the queue is clean!"),
      channel
    );
    return;
  }

  // 3. Post the spam chain with per-ticket list + bulk action buttons
  const blocks = formatSpamChainBlocks(spamTickets, slackUserId);
  await sendSlackBlocks(
    `🗑️ Spam Queue — ${spamTickets.length} tickets`,
    blocks,
    channel
  );
}

export async function handleCloseAllSpam({
  responseUrl,
  slackUserId,
  channel,
}: {
  responseUrl: string;
  slackUserId: string;
  channel: string;
}): Promise<void> {
  // 1. Lock the spam chain message immediately — prevents double-click
  await callResponseUrl(responseUrl, {
    text: `⏳ <@${slackUserId}> is closing all spam tickets...`,
    blocks: lockedBlock(
      `⏳ *<@${slackUserId}> is closing all spam tickets...* Please wait.`
    ),
    replace_original: true,
  });

  // 2. Re-fetch spam tickets (ensures we close current state, not stale count)
  const spamTickets = await fetchOpenSpamTickets();

  if (spamTickets.length === 0) {
    await callResponseUrl(responseUrl, {
      text: "✅ No open spam tickets — queue was already clean.",
      blocks: lockedBlock("✅ *No open spam tickets found* — queue was already clean."),
      replace_original: true,
    });
    return;
  }

  // 3. Close each ticket and log to agent behavior
  let closedCount = 0;
  const errors: number[] = [];

  for (const ticket of spamTickets) {
    try {
      // Idempotent: add auto-close tag if not already present, then close
      const newTags = ticket.tags.includes("auto-close")
        ? ticket.tags
        : [...ticket.tags, "auto-close"];
      await withRetry(() => updateTags(ticket.id, newTags));
      await withRetry(() => setStatus(ticket.id, "closed"));
      closedCount++;

      // Fire-and-forget log (don't let a log failure abort the close loop)
      createBehaviorLog({
        agent: `slack:${slackUserId}`,
        action: "close_as_spam",
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
        ticketTags: ticket.tags,
        tagsApplied: ["auto-close"],
        reopened: false,
        rawEvent: {
          source: "slack_interactivity",
          action: "close_all_spam",
          slackUserId,
          channel,
        },
        occurredAt: new Date(),
      }).catch((err) =>
        console.error(`[spam-chain] Log failed for #${ticket.id}:`, err)
      );
    } catch (err) {
      console.error(`[spam-chain] Failed to close ticket #${ticket.id}:`, err);
      errors.push(ticket.id);
    }
  }

  // 4. Update spam chain message with result
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const errorNote =
    errors.length > 0
      ? `\n_⚠️ ${errors.length} ticket${errors.length !== 1 ? "s" : ""} failed to close: ${errors.map((id) => `#${id}`).join(", ")}_`
      : "";

  await callResponseUrl(responseUrl, {
    text: `✅ Closed ${closedCount} spam tickets`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Closed ${closedCount} of ${spamTickets.length} spam ticket${spamTickets.length !== 1 ? "s" : ""}*\nActioned by <@${slackUserId}> at ${timestamp}${errorNote}`,
        },
      },
    ],
    replace_original: true,
  });
}

export async function handleCancelSpamReview({
  responseUrl,
  slackUserId,
}: {
  responseUrl: string;
  slackUserId: string;
}): Promise<void> {
  await callResponseUrl(responseUrl, {
    text: `❌ Spam review cancelled by <@${slackUserId}>`,
    blocks: lockedBlock(`❌ *Spam review cancelled* by <@${slackUserId}>`),
    replace_original: true,
  });
}
