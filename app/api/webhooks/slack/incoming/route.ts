import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRouterAgent } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";

const agent = createRouterAgent([sw3AnalyticsTool]);

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const body = await request.json();

  // Slack URL verification handshake
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  const text = body.event?.text || body.text || "";
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
