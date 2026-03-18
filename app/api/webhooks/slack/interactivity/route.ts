import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { handleApproval } from "@/lib/services/approval.service";
import { sendSlackMessage } from "@/lib/slack/client";
import { setStatus, assignTicket, updateTags } from "@/lib/gorgias/client";
import { withRetry } from "@/lib/services/retry.service";
import { logCronError } from "@/lib/services/logging.service";
import { getAgentEmailByName } from "@/lib/services/agent-routing.service";

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
    case "close_as_spam":
      await withRetry(() => updateTags(ticketId, ["auto-close", "non-support-related"]));
      await withRetry(() => setStatus(ticketId, "closed"));
      return `Closed ticket #${ticketId} as spam`;

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

  // Only handle block_actions (button clicks)
  if (payload.type !== "block_actions") {
    return NextResponse.json({ ok: true });
  }

  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ ok: true });

  const userId = payload.user?.id;
  const channel = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const threadTs = payload.message?.thread_ts || messageTs;

  // Parse button value
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

    // Still try to notify the user
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
