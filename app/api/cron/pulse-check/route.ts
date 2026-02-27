import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRouterAgent } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";

const PULSE_CHECK_PROMPT = `Run a pulse check on our Gorgias support tickets.
Use the sw3_analytics_insights tool to fetch and analyze current ticket data.
Then provide a summary including: total tickets, open vs closed breakdown,
average response time, busiest channels, and any concerning trends.
Format the response for Slack (use bullet points and keep it concise).`;

const agent = createRouterAgent([sw3AnalyticsTool]);

export async function GET(request: Request) {
  // Verify cron secret in production (Vercel sends this header)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await agent.invoke({
    messages: [new HumanMessage(PULSE_CHECK_PROMPT)],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  const summary =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

  // Send pulse check to Slack
  await sendSlackMessage(summary);

  // Log to pulse_checks table
  await prisma.pulseCheck.create({
    data: {
      channel: "cron",
      summary,
      ticketCount: null,
      insights: { source: "cron", prompt: PULSE_CHECK_PROMPT },
      status: "completed",
    },
  });

  return NextResponse.json({ ok: true, summary });
}
