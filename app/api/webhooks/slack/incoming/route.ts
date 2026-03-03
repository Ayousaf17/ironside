import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { logApiCall, logApiError, logWebhookError } from "@/lib/services/logging.service";
import { createRouterAgent, AGENT_MODEL } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sw1ReaderTool } from "@/lib/langchain/tools/sw1-reader";
import { sw2WriterTool } from "@/lib/langchain/tools/sw2-writer";
import { sw4TriageTool } from "@/lib/langchain/tools/sw4-triage";
import { sw5TemplateTool } from "@/lib/langchain/tools/sw5-templates";
import { sw6EscalationTool } from "@/lib/langchain/tools/sw6-escalation";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";
import { startSession, endSession } from "@/lib/services/session.service";
import { wrapToolsWithLogging } from "@/lib/langchain/tool-wrapper";
import { logTokenUsage } from "@/lib/services/token.service";

export const maxDuration = 60;

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

  const channel = body.event?.channel;
  const threadTs = body.event?.thread_ts || body.event?.ts;
  const slackUserId = body.event?.user;

  // Start session tracking
  let sessionId: string | undefined;
  let requestId: string | undefined;
  try {
    const session = await startSession({
      slackChannel: channel,
      slackThreadTs: threadTs,
      slackUserId,
      userMessage: text,
      model: AGENT_MODEL,
    });
    sessionId = session.sessionId;
    requestId = session.requestId;
  } catch (err) {
    console.error("[slack/incoming] Failed to create session:", err);
  }

  try {
    // Wrap tools with logging if we have a requestId
    const tools = requestId
      ? wrapToolsWithLogging(baseTools, requestId)
      : baseTools;
    const agent = createRouterAgent(tools);

    // Run the LangChain router agent
    const result = await agent.invoke({
      messages: [new HumanMessage(text)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    // Collect tool names used from the agent's message history
    const toolsUsed = result.messages
      .filter((m: { getType?: () => string }) => m.getType?.() === "tool")
      .map((m: { name?: string }) => m.name || "unknown")
      .filter((name: string, i: number, arr: string[]) => arr.indexOf(name) === i);

    // Log token usage from LLM responses
    const aiMessages = result.messages.filter(
      (m: { getType?: () => string }) => m.getType?.() === "ai"
    );
    for (const msg of aiMessages) {
      const usage = (msg as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
      if (usage?.input_tokens || usage?.output_tokens) {
        logTokenUsage({
          sessionId,
          requestId,
          model: AGENT_MODEL,
          promptTokens: usage.input_tokens || 0,
          completionTokens: usage.output_tokens || 0,
          source: "slack",
        }).catch((err) =>
          console.error("[slack/incoming] Failed to log tokens:", err)
        );
      }
    }

    // Send response to Slack
    await sendSlackMessage(responseText, channel);

    // End session tracking (success)
    if (sessionId) {
      endSession({
        sessionId,
        startTime,
        success: true,
        answer: responseText,
        toolsUsed,
      }).catch((err) =>
        console.error("[slack/incoming] Failed to end session:", err)
      );
    }

    // Log to api_logs
    await logApiCall({
      endpoint: "/webhooks/slack/incoming",
      method: "POST",
      status: 200,
      request: body,
      response: { text: responseText },
      duration: Date.now() - startTime,
    });

    return NextResponse.json({ ok: true, response: responseText });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[slack/incoming] Error:", errorMessage);

    // End session tracking (error)
    if (sessionId) {
      endSession({
        sessionId,
        startTime,
        success: false,
        error: errorMessage,
        toolsUsed: [],
      }).catch((err) =>
        console.error("[slack/incoming] Failed to end session:", err)
      );
    }

    try {
      await logWebhookError({
        endpoint: "/webhooks/slack/incoming",
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      await logApiError({
        endpoint: "/webhooks/slack/incoming",
        method: "POST",
        request: body,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      await sendSlackMessage(
        `Error processing message: ${errorMessage}`,
        channel
      );
    } catch (logError) {
      console.error("[slack/incoming] Error handler failed:", logError);
    }

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
