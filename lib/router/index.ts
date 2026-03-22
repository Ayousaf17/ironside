import { classifyIntent } from "./classifier";
import { executeIntent } from "./executor";
import { formatTicketResult, formatSearchResult, formatChatResponse } from "./formatter";
import { sendSlackMessage } from "@/lib/slack/client";

export async function handleRouterMessage(
  message: string,
  channel: string,
  threadTs: string
): Promise<void> {
  try {
    const classified = await classifyIntent(message);
    const result = await executeIntent(classified, message, channel);

    let formatted: string;

    if (result.ticket) {
      formatted = formatTicketResult(result.ticket);
    } else if (result.tickets !== undefined) {
      formatted = formatSearchResult(result.tickets, result.searchQuery ?? "");
    } else {
      formatted = formatChatResponse(result.text);
    }

    await sendSlackMessage(formatted, channel, threadTs);
  } catch (error) {
    console.error("[router] Unhandled error:", error);
    await sendSlackMessage(
      "Something went wrong. Try /ironside help for available commands.",
      channel,
      threadTs
    ).catch(() => {});
  }
}
