// Full agent diagnostic — uses ALL 6 tools, session tracking, tool wrappers
// Mirrors exactly what the Slack handler does, but synchronously with timing

import { NextResponse } from "next/server";
import { createRouterAgent, AGENT_MODEL, AGENT_TIMEOUT_MS } from "@/lib/langchain/router-agent";
import { sw1ReaderTool } from "@/lib/langchain/tools/sw1-reader";
import { sw2WriterTool } from "@/lib/langchain/tools/sw2-writer";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sw4TriageTool } from "@/lib/langchain/tools/sw4-triage";
import { sw5TemplateTool } from "@/lib/langchain/tools/sw5-templates";
import { sw6EscalationTool } from "@/lib/langchain/tools/sw6-escalation";
import { wrapToolsWithLogging } from "@/lib/langchain/tool-wrapper";
import { startSession, endSession } from "@/lib/services/session.service";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 60;

const allTools = [
  sw1ReaderTool,
  sw2WriterTool,
  sw3AnalyticsTool,
  sw4TriageTool,
  sw5TemplateTool,
  sw6EscalationTool,
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "how is the team doing today?";
  const sendToSlack = url.searchParams.get("slack") === "true";

  const steps: { step: string; ms: number }[] = [];
  const start = Date.now();
  function log(step: string) { steps.push({ step, ms: Date.now() - start }); }

  try {
    log("start");

    // Session tracking (same as Slack handler)
    log("starting session...");
    let requestId: string | undefined;
    let sessionId: string | undefined;
    try {
      const session = await startSession({
        slackChannel: "debug",
        slackThreadTs: "debug",
        slackUserId: "debug",
        userMessage: query,
        model: AGENT_MODEL,
      });
      sessionId = session.sessionId;
      requestId = session.requestId;
      log(`session created: ${sessionId?.slice(0, 8)}`);
    } catch (err) {
      log(`session FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Wrap tools (same as Slack handler)
    log("wrapping tools...");
    const tools = requestId ? wrapToolsWithLogging(allTools, requestId) : allTools;
    log(`tools wrapped: ${tools.length} tools`);

    // Create agent
    log("creating agent...");
    const agent = createRouterAgent(tools);
    log("agent created");

    // Invoke agent
    log("invoking agent...");
    const result = await Promise.race([
      agent.invoke({ messages: [new HumanMessage(query)] }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent timed out after ${AGENT_TIMEOUT_MS}ms`)), AGENT_TIMEOUT_MS)
      ),
    ]);
    log("agent responded");

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
    log(`response: ${responseText.length} chars`);

    // Send to Slack if requested
    if (sendToSlack) {
      const channel = process.env.SLACK_CHANNEL_ID;
      if (channel) {
        log("sending to Slack...");
        await sendSlackMessage(responseText, channel);
        log("Slack message sent");
      }
    }

    // End session
    if (sessionId) {
      await endSession({ sessionId, startTime: start, success: true, answer: responseText, toolsUsed: [] }).catch(() => {});
    }
    log("DONE");

    const messages = result.messages.map((m: { getType?: () => string; name?: string; content: unknown }) => ({
      type: m.getType?.() ?? "unknown",
      name: m.name,
      contentLength: typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length,
    }));

    return NextResponse.json({
      ok: true,
      model: AGENT_MODEL,
      timeoutMs: AGENT_TIMEOUT_MS,
      totalMs: Date.now() - start,
      steps,
      messageCount: messages.length,
      messages,
      response: responseText.slice(0, 500),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${msg}`);
    return NextResponse.json({
      ok: false, model: AGENT_MODEL, timeoutMs: AGENT_TIMEOUT_MS,
      totalMs: Date.now() - start, steps, error: msg,
    }, { status: 500 });
  }
}
