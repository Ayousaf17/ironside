import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { createRouterAgent } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sw1ReaderTool } from "@/lib/langchain/tools/sw1-reader";
import { sw2WriterTool } from "@/lib/langchain/tools/sw2-writer";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 60;

const agent = createRouterAgent([sw3AnalyticsTool, sw1ReaderTool, sw2WriterTool]);

function verifySlackSignature(rawBody: string, request: NextRequest): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return true; // skip verification if no secret configured (dev)

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;

  // Reject requests older than 5 minutes (replay attack protection)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const computed = `v0=${hash}`;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature));
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const rawBody = await request.text();
  const body = JSON.parse(rawBody);

  // Slack URL verification handshake
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Verify request is actually from Slack
  if (!verifySlackSignature(rawBody, request)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Ignore Slack retries (Slack resends if response takes >3s)
  if (request.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true, ignored: "retry" });
  }

  // Ignore bot messages (prevents infinite loop)
  if (body.event?.bot_id || body.event?.subtype) {
    return NextResponse.json({ ok: true, ignored: "bot_or_system_event" });
  }

  // Ignore empty messages
  const text = (body.event?.text || body.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: true, ignored: "empty_message" });
  }

  console.log("[slack/incoming]", text);

  try {
    // Run the LangChain router agent
    const result = await agent.invoke({
      messages: [new HumanMessage(text)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    // Send response to Slack (replaces n8n "Send Slack Message" node)
    const channel = body.event?.channel;
    await sendSlackMessage(responseText, channel);

    // Log to api_logs (replaces n8n Supabase "Log to api_logs" node)
    await prisma.apiLog.create({
      data: {
        endpoint: "/webhooks/slack/incoming",
        method: "POST",
        status: 200,
        request: body,
        response: { text: responseText },
        duration: Date.now() - startTime,
      },
    });

    return NextResponse.json({ ok: true, response: responseText });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[slack/incoming] Error:", errorMessage);

    // Log error to performance_metrics (replaces n8n "Log Error Performance Metrics" node)
    await prisma.performanceMetric.create({
      data: {
        metric: "webhook_error",
        value: 1,
        unit: "count",
        context: {
          error: errorMessage,
          endpoint: "/webhooks/slack/incoming",
          duration: Date.now() - startTime,
        },
      },
    });

    // Log failed request to api_logs
    await prisma.apiLog.create({
      data: {
        endpoint: "/webhooks/slack/incoming",
        method: "POST",
        status: 500,
        request: body,
        error: errorMessage,
        duration: Date.now() - startTime,
      },
    });

    // Send error to Slack (replaces n8n "Send Error to Slack" node)
    const channel = body.event?.channel;
    await sendSlackMessage(
      `Error processing message: ${errorMessage}`,
      channel
    );

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
