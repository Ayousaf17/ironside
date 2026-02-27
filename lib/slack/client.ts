import { WebClient } from "@slack/web-api";

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function sendSlackMessage(text: string, channel?: string) {
  const channelId = channel || process.env.SLACK_CHANNEL_ID;
  if (!channelId) throw new Error("No SLACK_CHANNEL_ID configured");

  return slack.chat.postMessage({ channel: channelId, text });
}
