import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRouterAgent } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
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

  // Run the LangChain router agent
  const result = await agent.invoke({
    messages: [new HumanMessage(text)],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  const responseText = typeof lastMessage.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);

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
}
