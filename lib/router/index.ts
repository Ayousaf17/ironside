import { classifyIntent } from "./classifier";
import { executeIntent, executePendingAction } from "./executor";
import {
  formatTicketResult,
  formatSearchResult,
  formatChatResponse,
  formatAnalyticsResult,
  formatEscalationResult,
} from "./formatter";
import { sendSlackMessage } from "@/lib/slack/client";
import { getThreadContext, updateThreadContext } from "@/lib/services/context.service";
import { hasPendingConfirmation, getPendingConfirmation } from "./confirmation";

export async function handleRouterMessage(
  message: string,
  channel: string,
  threadTs: string
): Promise<void> {
  try {
    // 1. Get thread context for multi-turn
    const context = await getThreadContext(threadTs);

    // 2. Check for confirmation of pending action
    const classified = await classifyIntent(message, context ?? undefined);

    if (classified.intent === "confirm") {
      if (hasPendingConfirmation(context)) {
        const pending = getPendingConfirmation(context);
        if (pending) {
          const result = await executePendingAction(pending);
          await updateThreadContext({
            slackThreadTs: threadTs,
            slackChannel: channel,
            lastAction: result.action,
            lastTicketIds: result.ticketIds,
            pendingConfirmation: undefined,
            incrementMessageCount: true,
          });
          await sendSlackMessage(result.text, channel, threadTs);
          return;
        }
      }
      // No pending confirmation — treat as chat
      const chatResult = await executeIntent(
        { intent: "chat", params: {}, confidence: 1 },
        message,
      );
      await sendSlackMessage(formatChatResponse(chatResult.text), channel, threadTs);
      return;
    }

    // 3. Execute the classified intent
    const result = await executeIntent(classified, message);

    // 4. Format the result
    let formatted: string;

    if (result.ticket) {
      formatted = formatTicketResult(result.ticket);
    } else if (result.tickets !== undefined) {
      formatted = formatSearchResult(result.tickets, result.searchQuery ?? "");
    } else if (result.analyticsData) {
      formatted = formatAnalyticsResult(result.analyticsData);
    } else if (result.escalationItems) {
      formatted = formatEscalationResult(result.escalationItems);
    } else {
      formatted = formatChatResponse(result.text);
    }

    // 5. Update thread context
    await updateThreadContext({
      slackThreadTs: threadTs,
      slackChannel: channel,
      lastAction: result.action,
      lastTicketIds: result.ticketIds,
      pendingConfirmation: result.confirmation,
      incrementMessageCount: true,
    }).catch((err) =>
      console.warn("[router] Context update failed:", err)
    );

    // 6. Send response
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
