import { WebClient } from "@slack/web-api";

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

type SlackChannelType = "ops" | "alerts" | "audit";

function getChannelId(type?: SlackChannelType): string {
  const fallback = process.env.SLACK_CHANNEL_ID;
  if (!type) {
    return fallback ?? (() => { throw new Error("No SLACK_CHANNEL_ID configured"); })();
  }

  const channelMap: Record<SlackChannelType, string | undefined> = {
    ops: process.env.SLACK_CHANNEL_OPS,
    alerts: process.env.SLACK_CHANNEL_ALERTS,
    audit: process.env.SLACK_CHANNEL_AUDIT,
  };

  return channelMap[type] ?? fallback ?? (() => { throw new Error("No SLACK_CHANNEL_ID configured"); })();
}

export async function sendSlackMessage(
  text: string,
  channel?: string,
  threadTs?: string,
  channelType?: SlackChannelType
) {
  const channelId = channel ?? getChannelId(channelType);

  return slack.chat.postMessage({
    channel: channelId,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
}

/**
 * Update a Slack message in-place via response_url (from interactivity payloads).
 * Used to lock messages immediately when a button is clicked.
 */
export async function callResponseUrl(
  responseUrl: string,
  payload: {
    text?: string;
    blocks?: object[];
    replace_original?: boolean;
    delete_original?: boolean;
    response_type?: "in_channel" | "ephemeral";
  }
): Promise<void> {
  const body = { replace_original: true, ...payload };
  const res = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[callResponseUrl] Failed:", res.status, await res.text());
  }
}

export async function sendSlackBlocks(
  text: string,
  blocks: unknown[],
  channel?: string,
  threadTs?: string,
  channelType?: SlackChannelType
) {
  const channelId = channel ?? getChannelId(channelType);

  return slack.chat.postMessage({
    channel: channelId,
    text,
    blocks: blocks as Parameters<typeof slack.chat.postMessage>[0] extends { blocks?: infer B } ? B : never,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
}
