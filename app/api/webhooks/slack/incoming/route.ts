import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { logApiCall, logApiError, logWebhookError } from "@/lib/services/logging.service";
import { createRouterAgent, AGENT_MODEL, AGENT_TIMEOUT_MS } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sw1ReaderTool } from "@/lib/langchain/tools/sw1-reader";
import { sw2WriterTool } from "@/lib/langchain/tools/sw2-writer";
import { sw4TriageTool } from "@/lib/langchain/tools/sw4-triage";
import { sw5TemplateTool } from "@/lib/langchain/tools/sw5-templates";
import { sw6EscalationTool } from "@/lib/langchain/tools/sw6-escalation";
import { sendSlackMessage, sendSlackBlocks } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";
import { startSession, endSession } from "@/lib/services/session.service";
import { wrapToolsWithLogging } from "@/lib/langchain/tool-wrapper";
import { getThreadContext, updateThreadContext, buildContextMessages } from "@/lib/services/context.service";
import { SystemMessage } from "@langchain/core/messages";

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

  // Ignore Slack retries
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

  const channel = body.event?.channel;
  const threadTs = body.event?.thread_ts || body.event?.ts;
  const slackUserId = body.event?.user;

  // Process the LLM call synchronously — no after(), no background work.
  // Hobby plan doesn't reliably run after() background tasks.
  // Slack retries are handled above (x-slack-retry-num).
  console.log("[slack/incoming]", text);

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
    const tools = requestId
      ? wrapToolsWithLogging(baseTools, requestId)
      : baseTools;
    const agent = createRouterAgent(tools);

    // Load conversation context for multi-turn support
    const messages: (SystemMessage | HumanMessage)[] = [];
    if (threadTs) {
      try {
        const ctx = await getThreadContext(threadTs);
        if (ctx) {
          const contextMsg = buildContextMessages(ctx);
          if (contextMsg) {
            messages.push(new SystemMessage(contextMsg));
          }
        }
      } catch (err) {
        console.error("[slack/incoming] Failed to load context:", err);
      }
    }
    messages.push(new HumanMessage(text));

    // Run the LangChain router agent with timeout guard
    const result = await Promise.race([
      agent.invoke({ messages }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Agent timed out")), AGENT_TIMEOUT_MS)
      ),
    ]);

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    // Collect tool names used
    const toolsUsed = result.messages
      .filter((m: { getType?: () => string }) => m.getType?.() === "tool")
      .map((m: { name?: string }) => m.name || "unknown")
      .filter((name: string, i: number, arr: string[]) => arr.indexOf(name) === i);

    // Send response to Slack
    const referencedTickets: { id: number; subject: string }[] = [];
    for (const m of result.messages) {
      if (m.getType?.() !== "tool") continue;
      try {
        const parsed = JSON.parse(typeof m.content === "string" ? m.content : "{}");
        if (parsed.ticket?.id) {
          referencedTickets.push({ id: parsed.ticket.id, subject: (parsed.ticket.subject ?? "").slice(0, 80) });
        }
        if (parsed.tickets) {
          for (const t of parsed.tickets.slice(0, 5)) {
            if (t.id) referencedTickets.push({ id: t.id, subject: (t.subject ?? "").slice(0, 80) });
          }
        }
      } catch { /* skip */ }
    }

    const seen = new Set<number>();
    const uniqueTickets = referencedTickets.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    }).slice(0, 5);

    if (uniqueTickets.length > 0) {
      const blocks: object[] = [
        { type: "section", text: { type: "mrkdwn", text: responseText } },
        { type: "divider" },
        {
          type: "actions",
          elements: uniqueTickets.map((t) => ({
            type: "button",
            text: { type: "plain_text", text: `Reply #${t.id}` },
            action_id: "open_reply_modal",
            value: JSON.stringify({ ticketId: t.id, tags: [], subject: t.subject }),
          })),
        },
      ];
      await sendSlackBlocks(responseText, blocks, channel, threadTs);
    } else {
      await sendSlackMessage(responseText, channel, threadTs);
    }

    // End session (fire and forget)
    if (sessionId) {
      endSession({ sessionId, startTime, success: true, answer: responseText, toolsUsed })
        .catch((err) => console.error("[slack/incoming] Failed to end session:", err));
    }

    // Log (fire and forget)
    logApiCall({
      endpoint: "/webhooks/slack/incoming",
      method: "POST",
      status: 200,
      request: body,
      response: { text: responseText },
      duration: Date.now() - startTime,
      actorUser: slackUserId,
      slackChannel: channel,
      slackThreadTs: threadTs,
      intent: toolsUsed[0] ?? "general_query",
      toolsUsed,
      sessionId,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[slack/incoming] Error:", errorMessage);

    // Send error message to Slack
    await sendSlackMessage(
      "Sorry, I encountered an error processing your request. Please try again.",
      channel,
      threadTs
    ).catch(() => {});

    // Log error (fire and forget)
    logWebhookError({ endpoint: "/webhooks/slack/incoming", error: errorMessage, duration: Date.now() - startTime }).catch(() => {});
    logApiError({ endpoint: "/webhooks/slack/incoming", method: "POST", request: body, error: errorMessage, duration: Date.now() - startTime }).catch(() => {});

    if (sessionId) {
      endSession({ sessionId, startTime, success: false, error: errorMessage, toolsUsed: [] }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }
}
