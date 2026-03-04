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
import { sendSlackMessage, sendSlackBlocks } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";
import { startSession, endSession } from "@/lib/services/session.service";
import { wrapToolsWithLogging } from "@/lib/langchain/tool-wrapper";
import { logTokenUsage } from "@/lib/services/token.service";
import { getThreadContext, updateThreadContext, buildContextMessages } from "@/lib/services/context.service";
import { SystemMessage } from "@langchain/core/messages";
import { getCategoryTier, createApprovalRequest } from "@/lib/services/approval.service";
import { formatApprovalBlocks } from "@/lib/slack/formatters";

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

  console.log("[slack/incoming] type:", body.type, "event_type:", body.event?.type, "bot_id:", body.event?.bot_id, "subtype:", body.event?.subtype, "text:", body.event?.text?.substring(0, 50));

  // Verify request is actually from Slack
  if (!verifySlackSignature(rawBody, request)) {
    console.log("[slack/incoming] REJECTED: invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Log Slack retries but process them (agent may take >3s to respond)
  const retryNum = request.headers.get("x-slack-retry-num");
  if (retryNum) {
    console.log(`[slack/incoming] Retry #${retryNum} — processing anyway`);
  }

  // Ignore bot messages (prevents infinite loop)
  if (body.event?.bot_id || body.event?.subtype) {
    console.log("[slack/incoming] FILTERED: bot or system event");
    return NextResponse.json({ ok: true, ignored: "bot_or_system_event" });
  }

  // Ignore empty messages
  const text = (body.event?.text || body.text || "").trim();
  if (!text) {
    console.log("[slack/incoming] FILTERED: empty message");
    return NextResponse.json({ ok: true, ignored: "empty_message" });
  }

  console.log("[slack/incoming] PROCESSING:", text);

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

    // Run the LangChain router agent
    const result = await agent.invoke({ messages });

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

    // Save conversation context for multi-turn support
    if (threadTs) {
      // Extract ticket IDs mentioned in tool outputs
      const ticketIds: number[] = [];
      for (const m of result.messages) {
        if (m.getType?.() === "tool") {
          try {
            const parsed = JSON.parse(typeof m.content === "string" ? m.content : "{}");
            if (parsed.ticket?.id) ticketIds.push(parsed.ticket.id);
            if (parsed.tickets) {
              for (const t of parsed.tickets) {
                if (t.id) ticketIds.push(t.id);
              }
            }
          } catch { /* not JSON, skip */ }
        }
      }
      const uniqueTicketIds = [...new Set(ticketIds)];

      updateThreadContext({
        slackThreadTs: threadTs,
        slackChannel: channel,
        slackUserId,
        lastAction: toolsUsed[0] || "chat",
        lastTicketIds: uniqueTicketIds.length > 0 ? uniqueTicketIds : undefined,
        incrementMessageCount: true,
      }).catch((err) =>
        console.error("[slack/incoming] Failed to save context:", err)
      );
    }

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

    // Check for Tier 2 HITL: if agent used auto_route/classify_ticket,
    // check category tier and send approval request instead of auto-executing
    let hitlSent = false;
    if (threadTs) {
      for (const m of result.messages) {
        if (m.getType?.() !== "tool" || m.name !== "sw4_auto_triage") continue;
        try {
          const parsed = JSON.parse(
            typeof m.content === "string" ? m.content : "{}"
          );
          const category = parsed.classification?.category;
          const ticketId = parsed.ticket_id;
          if (category && ticketId && parsed.actions_taken) {
            const tier = await getCategoryTier(category);
            if (tier === "T2") {
              const confidence = parsed.classification?.suggestedPriority === "critical" ? 0.95 : 0.85;
              const action = category === "spam" ? "close_as_spam" :
                parsed.classification?.suggestedAgent?.includes("spencer") ? "assign_spencer" : "assign_danni";

              await createApprovalRequest({
                ticketId,
                category,
                confidence,
                recommendedAction: action,
                agentResponse: responseText,
                slackChannel: channel,
                slackThreadTs: threadTs,
              });

              const blocks = formatApprovalBlocks({
                ticketId,
                category,
                confidence,
                recommendedAction: action,
                agentResponse: responseText,
              });

              await sendSlackBlocks(
                `AI recommendation for ticket #${ticketId}`,
                blocks,
                channel,
                threadTs
              );
              hitlSent = true;
              break;
            }
          }
        } catch { /* not parseable, skip */ }
      }
    }

    // Send response to Slack (reply in-thread if message was in a thread)
    if (!hitlSent) {
      await sendSlackMessage(responseText, channel, threadTs);
    }

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
        channel,
        threadTs
      );
    } catch (logError) {
      console.error("[slack/incoming] Error handler failed:", logError);
    }

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
