// Slack slash command receiver — handles /ironside commands.
//
// Setup in Slack App:
//   Slash Commands → Create New Command
//   Command: /ironside
//   Request URL: https://ironside-alpha.vercel.app/api/webhooks/slack/slash
//   Short Description: Ironside support queries
//
// Slack requires a response within 3 seconds.
// Heavy operations use response_url for deferred replies.

import { NextRequest, NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { handleSlashCommand } from "@/lib/slack/handlers/slash-command";

export const maxDuration = 30;

function verifySlackSignature(rawBody: string, request: NextRequest): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true;

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;

  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computed = `v0=${hash}`;

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySlackSignature(rawBody, request)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const text = params.get("text") ?? "";
  const responseUrl = params.get("response_url") ?? "";

  // Return immediate ack — Slack has a 3s deadline
  // Actual response is sent via response_url after processing
  after(async () => {
    try {
      const result = await handleSlashCommand(text);

      const body: Record<string, unknown> = {
        response_type: result.response_type ?? "ephemeral",
        text: result.text,
      };
      if (result.blocks) body.blocks = result.blocks;

      await fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[slash-command] Error:", message);

      await fetch(responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_type: "ephemeral",
          text: `⚠️ Something went wrong: ${message}`,
        }),
      }).catch(() => { /* best effort */ });
    }
  });

  // Immediate empty 200 — Slack won't show anything until response_url is called
  return new NextResponse(null, { status: 200 });
}
