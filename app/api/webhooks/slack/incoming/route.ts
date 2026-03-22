import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { sendSlackMessage } from "@/lib/slack/client";
import { handleRouterMessage } from "@/lib/router";

export const maxDuration = 60;

// Router pattern — intent classify → execute → format → send.
// Replaces the direct LangChain ChatOpenAI call that timed out due to
// multi-step tool loops. Slash commands handle write/ops operations.

function verifySlackSignature(rawBody: string, request: NextRequest): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  return timingSafeEqual(Buffer.from(`v0=${hash}`), Buffer.from(slackSignature));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const body = JSON.parse(rawBody);

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }
  if (!verifySlackSignature(rawBody, request)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (request.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true, ignored: "retry" });
  }
  if (body.event?.bot_id || body.event?.subtype) {
    return NextResponse.json({ ok: true, ignored: "bot_or_system_event" });
  }

  const text = (body.event?.text || body.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: true, ignored: "empty_message" });
  }

  const channel = body.event?.channel;
  const threadTs = body.event?.thread_ts || body.event?.ts;

  // Return 200 immediately, process in background
  after(async () => {
    console.log("[slack/incoming]", text);
    await handleRouterMessage(text, channel, threadTs);
  });

  return NextResponse.json({ ok: true });
}
