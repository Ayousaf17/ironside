// Reply chain handlers — called from the Slack interactivity route.
// Flow: open_reply_modal → select_macro (optional updates) → view_submission
//
// Opens a Slack modal with macro suggestions per ticket category.
// On submit, sends the reply via Gorgias replyPublic() and logs the action.

import { getTicket, getMacros, replyPublic } from "@/lib/gorgias/client";
import { formatReplyModal } from "@/lib/slack/formatters";
import { slack, sendSlackBlocks } from "@/lib/slack/client";
import { createBehaviorLog } from "@/lib/repos/agent-behavior-log.repo";
import { withRetry } from "@/lib/services/retry.service";
import type { GorgiasMacro } from "@/lib/gorgias/mock";

const TAG_TO_CATEGORY: Record<string, string> = {
  "ORDER-STATUS":         "track_order",
  "ORDER-VERIFICATION":   "order_verification",
  "RETURN/EXCHANGE":      "return_exchange",
  "REPORT-ISSUE":         "report_issue",
  "PRODUCT":              "product_question",
  "ORDER-CHANGE/CANCEL":  "order_change_cancel",
  "CONTACT-FORM":         "contact_form",
};

// Maps Gorgias ticket tags to relevant macro tag keywords
const TAG_TO_MACRO_TAGS: Record<string, string[]> = {
  "ORDER-STATUS":        ["order-status"],
  "ORDER-VERIFICATION":  ["verification"],
  "RETURN/EXCHANGE":     ["returns"],
  "REPORT-ISSUE":        ["technical"],
  "ORDER-CHANGE/CANCEL": ["returns"],
  "PRODUCT":             [],  // show all
  "CONTACT-FORM":        [],  // show all
};

function getMacrosForTicket(ticketTags: string[], allMacros: GorgiasMacro[]): GorgiasMacro[] {
  const relevantMacroTags = new Set<string>();
  let showAll = false;

  for (const tag of ticketTags) {
    const macroTags = TAG_TO_MACRO_TAGS[tag.toUpperCase()];
    if (macroTags === undefined) continue;
    if (macroTags.length === 0) { showAll = true; continue; }
    macroTags.forEach((t) => relevantMacroTags.add(t));
  }

  // Exclude spam/auto-close macro from the picker
  const usable = allMacros.filter((m) => !m.tags.includes("spam") && !m.tags.includes("auto-close"));

  if (showAll || relevantMacroTags.size === 0) return usable;

  const filtered = usable.filter((m) => m.tags.some((t) => relevantMacroTags.has(t)));
  return filtered.length > 0 ? filtered : usable;
}

// Opens the reply modal for a specific ticket.
// Called synchronously (not via after()) so the trigger_id is used before it expires.
export async function handleOpenReplyModal({
  triggerId,
  ticketId,
  tags,
}: {
  triggerId: string;
  ticketId: number;
  tags: string[];
}): Promise<void> {
  const [ticket, allMacros] = await Promise.all([getTicket(ticketId), getMacros()]);

  if (!ticket) {
    console.error(`[reply-chain] Ticket #${ticketId} not found`);
    return;
  }

  const lastCustomerMessage =
    [...ticket.messages].reverse().find((m) => m.sender.type === "customer")?.body_text ??
    "(No customer message found)";

  const macros = getMacrosForTicket(tags, allMacros);

  const modalView = formatReplyModal({
    ticketId,
    subject: ticket.subject,
    lastCustomerMessage,
    macros,
    selectedMacroId: macros[0]?.id,
  });

  await slack.views.open({
    trigger_id: triggerId,
    view: modalView as Parameters<typeof slack.views.open>[0]["view"],
  });
}

// Updates the reply modal when the agent selects a different macro.
// Called synchronously so the modal updates immediately.
export async function handleMacroSelect({
  viewId,
  viewHash,
  selectedMacroId,
  ticketId,
}: {
  viewId: string;
  viewHash: string;
  selectedMacroId: number;
  ticketId: number;
}): Promise<void> {
  const [ticket, allMacros] = await Promise.all([getTicket(ticketId), getMacros()]);

  const lastCustomerMessage = ticket
    ? ([...ticket.messages].reverse().find((m) => m.sender.type === "customer")?.body_text ?? "")
    : "";

  const macros = getMacrosForTicket(ticket?.tags ?? [], allMacros);

  const updatedView = formatReplyModal({
    ticketId,
    subject: ticket?.subject ?? `Ticket #${ticketId}`,
    lastCustomerMessage,
    macros,
    selectedMacroId,
  });

  await slack.views.update({
    view_id: viewId,
    hash: viewHash,
    view: updatedView as Parameters<typeof slack.views.update>[0]["view"],
  });
}

// Sends the reply to Gorgias after the agent submits the modal.
// Called via after() — modal is already closed before this runs.
export async function handleReplySubmit({
  viewPayload,
  slackUserId,
}: {
  viewPayload: {
    private_metadata: string;
    state: { values: Record<string, Record<string, { value?: string | null }>> };
  };
  slackUserId: string;
}): Promise<void> {
  const { ticketId, selectedMacroId, macroName } = JSON.parse(viewPayload.private_metadata) as {
    ticketId: number;
    selectedMacroId: number | null;
    macroName: string | null;
  };

  const replyText = viewPayload.state.values.reply_input?.reply_text?.value ?? "";
  if (!replyText.trim()) return;

  try {
    await withRetry(() => replyPublic(ticketId, replyText));

    createBehaviorLog({
      agent: `slack:${slackUserId}`,
      action: "reply_ticket",
      ticketId,
      responseText: replyText,
      responseCharCount: replyText.length,
      macroIdUsed: selectedMacroId ?? undefined,
      macroName: macroName ?? undefined,
      tagsApplied: [],
      reopened: false,
      rawEvent: {
        source: "slack_interactivity",
        action: "reply_modal_submit",
        slackUserId,
      },
      occurredAt: new Date(),
    }).catch((err) => console.error(`[reply-chain] Log failed for #${ticketId}:`, err));

    // Post-reply nudge: tell #ops a reply was sent + hint at similar open tickets
    getTicket(ticketId)
      .then((ticket) => {
        if (!ticket) return;
        let category: string | null = null;
        for (const tag of ticket.tags ?? []) {
          const cat = TAG_TO_CATEGORY[tag.toUpperCase()];
          if (cat) { category = cat; break; }
        }
        const categoryDisplay = category ? category.replace(/_/g, " ") : null;
        const nudgeText = categoryDisplay
          ? `✅ <@${slackUserId}> replied to *#${ticketId}*. More *${categoryDisplay}* tickets in the queue? Use the pulse check triage buttons.`
          : `✅ <@${slackUserId}> replied to *#${ticketId}*.`;
        return sendSlackBlocks(
          `✅ Reply sent to #${ticketId}`,
          [{ type: "context", elements: [{ type: "mrkdwn", text: nudgeText }] }],
          undefined, undefined, "ops",
        );
      })
      .catch(() => {}); // nudge is best-effort
  } catch (err) {
    console.error(`[reply-chain] Failed to send reply for #${ticketId}:`, err);
  }
}
