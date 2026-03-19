import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { handleApproval } from "@/lib/services/approval.service";
import { sendSlackMessage } from "@/lib/slack/client";
import { setStatus, assignTicket } from "@/lib/gorgias/client";
import { withRetry } from "@/lib/services/retry.service";
import { logCronError } from "@/lib/services/logging.service";
import { getAgentEmailByName } from "@/lib/services/agent-routing.service";
import {
  handleShowSpamTickets,
  handleCloseAllSpam,
  handleCancelSpamReview,
} from "@/lib/slack/handlers/spam-chain";
import {
  handleShowUnassignedTickets,
  handleAutoAssignTriage,
  handleCancelTriage,
} from "@/lib/slack/handlers/triage-chain";
import {
  handleOpenReplyModal,
  handleMacroSelect,
  handleReplySubmit,
} from "@/lib/slack/handlers/reply-chain";
import {
  handleWrongCategoryFeedback,
  handleCategoryCorrectionSubmit,
} from "@/lib/slack/handlers/wrong-category";

export const maxDuration = 30;

function verifySlackSignature(rawBody: string, request: NextRequest): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true;

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;

  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const computed = `v0=${hash}`;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature));
}

// Execute approved actions on Gorgias tickets
async function executeAction(
  ticketId: number,
  action: string
): Promise<string> {
  switch (action) {
    case "close":
      await withRetry(() => setStatus(ticketId, "closed"));
      return `Closed ticket #${ticketId}`;

    case "assign_spencer": {
      const spencerEmail = await getAgentEmailByName("spencer");
      await withRetry(() => assignTicket(ticketId, spencerEmail));
      return `Assigned ticket #${ticketId} to Spencer`;
    }

    case "assign_danni": {
      const danniEmail = await getAgentEmailByName("danni");
      await withRetry(() => assignTicket(ticketId, danniEmail));
      return `Assigned ticket #${ticketId} to Danni-Jean`;
    }

    default:
      return `Unknown action: ${action}`;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySlackSignature(rawBody, request)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    return NextResponse.json({ error: "No payload" }, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // ── Reply modal submission ────────────────────────────────────────────────
  if (payload.type === "view_submission" && payload.view?.callback_id === "reply_modal") {
    const userId = payload.user?.id ?? "unknown";
    after(() => handleReplySubmit({ viewPayload: payload.view, slackUserId: userId }));
    return NextResponse.json({}); // empty body closes the modal
  }

  // ── Category correction modal submission ─────────────────────────────────
  if (payload.type === "view_submission" && payload.view?.callback_id === "category_correction_modal") {
    const userId = payload.user?.id ?? "unknown";
    after(() => handleCategoryCorrectionSubmit({ viewPayload: payload.view, slackUserId: userId }));
    return NextResponse.json({}); // empty body closes the modal
  }

  if (payload.type !== "block_actions") {
    return NextResponse.json({ ok: true });
  }

  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ ok: true });

  const userId = payload.user?.id ?? "unknown";
  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const threadTs = payload.message?.thread_ts || messageTs;
  const responseUrl: string = payload.response_url ?? "";

  // ── Spam chain ──────────────────────────────────────────────────────────
  // Return 200 immediately (Slack 3s deadline), do work in background via after().
  // response_url is called inside each handler to lock the message before any
  // Gorgias work begins — this is the concurrency protection mechanism.

  if (action.action_id === "show_spam_tickets") {
    after(() =>
      handleShowSpamTickets({ responseUrl, slackUserId: userId, channel })
    );
    return NextResponse.json({ ok: true });
  }

  if (action.action_id === "close_all_spam") {
    after(() =>
      handleCloseAllSpam({ responseUrl, slackUserId: userId, channel })
    );
    return NextResponse.json({ ok: true });
  }

  if (action.action_id === "cancel_spam_review") {
    after(() =>
      handleCancelSpamReview({ responseUrl, slackUserId: userId })
    );
    return NextResponse.json({ ok: true });
  }

  // ── Triage chain ─────────────────────────────────────────────────────────
  if (action.action_id === "show_unassigned_tickets") {
    after(() =>
      handleShowUnassignedTickets({ responseUrl, slackUserId: userId, channel })
    );
    return NextResponse.json({ ok: true });
  }

  if (action.action_id === "auto_assign_triage") {
    after(() =>
      handleAutoAssignTriage({ responseUrl, slackUserId: userId })
    );
    return NextResponse.json({ ok: true });
  }

  if (action.action_id === "cancel_triage") {
    after(() =>
      handleCancelTriage({ responseUrl, slackUserId: userId })
    );
    return NextResponse.json({ ok: true });
  }

  // ── Reply chain ──────────────────────────────────────────────────────────
  // open_reply_modal: handled synchronously — trigger_id expires in ~3s
  if (action.action_id === "open_reply_modal") {
    const { ticketId, tags } = JSON.parse(action.value) as { ticketId: number; tags: string[] };
    try {
      await handleOpenReplyModal({ triggerId: payload.trigger_id, ticketId, tags });
    } catch (err) {
      console.error("[slack/interactivity] handleOpenReplyModal failed:", err);
    }
    return NextResponse.json({ ok: true });
  }

  // select_macro: handled synchronously — user is waiting for modal to update
  if (action.action_id === "select_macro" && payload.view) {
    const selectedMacroId = parseInt((action.selected_option as { value: string })?.value ?? "0", 10);
    const viewId: string = payload.view.id;
    const viewHash: string = payload.view.hash;
    const { ticketId } = JSON.parse(payload.view.private_metadata ?? "{}") as { ticketId: number };
    try {
      await handleMacroSelect({ viewId, viewHash, selectedMacroId, ticketId });
    } catch (err) {
      console.error("[slack/interactivity] handleMacroSelect failed:", err);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Wrong category feedback ──────────────────────────────────────────────
  // Handled synchronously — trigger_id expires in ~3s
  if (action.action_id === "wrong_category_feedback") {
    const { ticketId, aiCategory, ticketSubject } = JSON.parse(action.value) as {
      ticketId: number;
      aiCategory: string;
      ticketSubject: string;
    };
    try {
      await handleWrongCategoryFeedback({
        triggerId: payload.trigger_id,
        ticketId,
        aiCategory,
        ticketSubject,
        opsChannel: channel,
      });
    } catch (err) {
      console.error("[slack/interactivity] handleWrongCategoryFeedback failed:", err);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Category triage (from pulse check category buttons) ──────────────────
  if (action.action_id.startsWith("show_category_triage")) {
    const { category } = JSON.parse(action.value) as { category: string; question: string; count: number };
    after(() =>
      handleShowUnassignedTickets({ responseUrl, slackUserId: userId, channel, categoryFilter: category })
    );
    return NextResponse.json({ ok: true });
  }

  // ── Legacy approval flow (T1 agent recommendations) ─────────────────────
  let actionData: { ticketId: number; action: string };
  try {
    actionData = JSON.parse(action.value);
  } catch {
    return NextResponse.json({ error: "Invalid action value" }, { status: 400 });
  }

  const approved = action.action_id === "approve_action";

  try {
    const pending = await handleApproval(threadTs, approved);

    if (approved && pending) {
      const result = await executeAction(pending.ticketId, pending.recommendedAction);
      await sendSlackMessage(
        `:white_check_mark: *Approved by <@${userId}>*\n${result}`,
        channel,
        threadTs
      );
    } else {
      await sendSlackMessage(
        `:x: *Rejected by <@${userId}>* — No action taken on ticket #${actionData.ticketId}`,
        channel,
        threadTs
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[slack/interactivity] Error:", errorMessage);

    await logCronError({
      metric: "slack_interactivity_error",
      error: errorMessage,
    });

    try {
      await sendSlackMessage(
        `:warning: Error processing action: ${errorMessage}`,
        channel,
        threadTs
      );
    } catch { /* best effort */ }

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
