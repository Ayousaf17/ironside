import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRouterAgent } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sendSlackMessage } from "@/lib/slack/client";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 60;

const PULSE_CHECK_PROMPT = `Run a support pulse check using the sw3_analytics_insights tool.

Then produce a Slack-formatted operational briefing following these rules:

1. SEPARATE spam from real support. Report spam count/rate, then focus analysis on real tickets only.
2. For resolution times, only report P50 and P90 on real tickets (exclude auto-closed spam). If P50 is under 2 min, note that it's likely skewed by auto-responses.
3. Show agent workload breakdown (who's handling what, close rates).
4. List the top 3 recurring question categories with ticket counts.
5. Flag any open tickets that appear urgent or overdue (especially order status tickets past the 15-20 day build window).
6. Give exactly 3 SPECIFIC action items — not generic advice like "review filters." Name the ticket IDs, agent names, or specific patterns to address.
7. Use this Slack format:

:bar_chart: *Support Pulse Check*
_[date range] • [total] tickets_

*Status:* Open: X | Closed: Y
*Spam:* Z tickets (N%) — auto-closed non-support
*Real Support:* R tickets

*Resolution (real tickets only):*
Avg: X min • P50: Y min • P90: Z min (N tickets analyzed)

*Top Questions:*
1. "Category" — N tickets
2. "Category" — N tickets
3. "Category" — N tickets

*Workload:*
- Agent: N tickets (N% close rate)
- Unassigned: N (N%)

*:rotating_light: Action Items:*
1. [Specific action with ticket IDs or agent names]
2. [Specific action]
3. [Specific action]`;

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

  try {
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
        insights: { source: "cron", prompt: "pulse-check-v2" },
        status: "completed",
      },
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/pulse-check] Error:", errorMessage);

    // Log error to performance_metrics
    await prisma.performanceMetric.create({
      data: {
        metric: "cron_pulse_check_error",
        value: 1,
        unit: "count",
        context: { error: errorMessage },
      },
    });

    // Send error notification to Slack
    await sendSlackMessage(`Pulse check cron failed: ${errorMessage}`);

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
