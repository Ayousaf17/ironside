import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createRouterAgent, AGENT_TIMEOUT_MS } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sw1ReaderTool } from "@/lib/langchain/tools/sw1-reader";
import { sw2WriterTool } from "@/lib/langchain/tools/sw2-writer";
import { sw4TriageTool } from "@/lib/langchain/tools/sw4-triage";
import { sw5TemplateTool } from "@/lib/langchain/tools/sw5-templates";
import { sw6EscalationTool } from "@/lib/langchain/tools/sw6-escalation";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 10;

const baseTools = [
  sw1ReaderTool,
  sw2WriterTool,
  sw3AnalyticsTool,
  sw4TriageTool,
  sw5TemplateTool,
  sw6EscalationTool,
];

function verifySlackSignature(rawBody: string, request: NextRequest): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;

  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computed = `v0=${hash}`;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const body = JSON.parse(rawBody);

  // Slack URL verification
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Verify Slack signature
  if (!verifySlackSignature(rawBody, request)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Ignore retries
  if (request.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true, ignored: "retry" });
  }

  // Ignore bot messages
  if (body.event?.bot_id || body.event?.subtype) {
    return NextResponse.json({ ok: true, ignored: "bot_or_system_event" });
  }

  // Ignore empty messages
  const text = (body.event?.text || body.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: true, ignored: "empty_message" });
  }

  const channel = body.event?.channel;
  const threadTs = body.event?.thread_ts || body.event?.ts;

  console.log("[slack/incoming] Processing:", text);

  try {
    // Create agent and invoke — stripped down, no session/context/logging overhead
    const agent = createRouterAgent(baseTools);
    const result = await Promise.race([
      agent.invoke({ messages: [new HumanMessage(text)] }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Agent timed out")), AGENT_TIMEOUT_MS)
      ),
    ]);

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    console.log("[slack/incoming] Response:", responseText.slice(0, 100));

    await sendSlackMessage(responseText, channel, threadTs);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[slack/incoming] Error:", msg);

    await sendSlackMessage(
      `Error: ${msg}`,
      channel,
      threadTs
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  }
}
