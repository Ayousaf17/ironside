import { NextResponse } from "next/server";
import { createPulseCheck } from "@/lib/repos/pulse-check.repo";
import { logCronError } from "@/lib/services/logging.service";
import { createRouterAgent } from "@/lib/langchain/router-agent";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { sendSlackBlocks, sendSlackMessage } from "@/lib/slack/client";
import { formatPulseCheckBlocks } from "@/lib/slack/formatters";
import { getTickets } from "@/lib/gorgias/client";
import { calculateAnalytics } from "@/lib/analytics/calculate";
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

function extractOpsNotes(summary: string): string[] {
  const lines = summary.split("\n");
  const startIdx = lines.findIndex((l) => l.includes("Action Items"));
  if (startIdx === -1) return [];
  const notes: string[] = [];
  for (let i = startIdx + 1; i < lines.length && notes.length < 6; i++) {
    const match = lines[i].match(/^\d+\.\s*(.+)/);
    if (match) notes.push(match[1].trim());
  }
  return notes;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch tickets updated in the last 24 hours — one pulse per day window
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tickets = await getTickets({ updatedAfter: twentyFourHoursAgo });
    const analytics = calculateAnalytics(tickets);

    const workloadMap = Object.fromEntries(
      analytics.agentBreakdown.map((a) => [a.agent, a.ticketCount])
    );
    const tagsMap = Object.fromEntries(
      analytics.topTags.map((t) => [t.tag, t.count])
    );

    // 2. Run LLM agent for Slack narrative + action items
    const result = await agent.invoke({
      messages: [new HumanMessage(PULSE_CHECK_PROMPT)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const summary =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    const opsNotes = extractOpsNotes(summary);

    // 3. Send to Slack as Block Kit
    const blocks = formatPulseCheckBlocks({
      summary,
      analytics: {
        ...analytics,
        spamCount: analytics.spamCount,
        unassignedCount: analytics.unassignedCount,
      },
      dateRangeStart: twentyFourHoursAgo,
      dateRangeEnd: now,
    });
    blocks.forEach((block, i) => {
      const b = block as Record<string, unknown>;
      const detail = b.text
        ? JSON.stringify(b.text).slice(0, 200)
        : b.fields
        ? `fields[${(b.fields as unknown[]).length}]`
        : String(b.type);
      console.log(`[pulse-check] block[${i}] ${b.type}:`, detail);
    });
    await sendSlackBlocks("📊 Support Pulse Check", blocks, undefined, undefined, "ops");

    // 4. Persist — structured fields + raw blob + LLM summary
    await createPulseCheck({
      channel: "cron",
      summary,
      status: "completed",
      ticketCount: analytics.totalTickets,
      openTickets: analytics.openTickets,
      closedTickets: analytics.closedTickets,
      spamRate: analytics.spamRate,
      avgResolutionMin: analytics.avgResolutionMinutes,
      topCategory: analytics.topQuestions[0]?.question ?? null,
      rawAnalytics: analytics as unknown as object,
      insights: { source: "cron", prompt: "pulse-check-v2" },
      dateRangeStart: twentyFourHoursAgo,
      dateRangeEnd: now,
      resolutionP50Min: analytics.p50ResolutionMinutes,
      resolutionP90Min: analytics.p90ResolutionMinutes,
      ticketsAnalyzed: analytics.ticketsAnalyzed,
      unassignedPct: analytics.unassignedRate,
      channelEmail: analytics.ticketsByChannel["email"] ?? 0,
      channelChat: analytics.ticketsByChannel["chat"] ?? 0,
      workload: workloadMap,
      topQuestions: analytics.topQuestions,
      tags: tagsMap,
      opsNotes,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    // Log the full Slack API response (includes response_metadata.messages for invalid_blocks)
    const errorData = (error as Record<string, unknown>)?.data;
    console.error("[cron/pulse-check] Error:", errorMessage, errorData ? JSON.stringify(errorData) : "");

    await logCronError({
      metric: "cron_pulse_check_error",
      error: errorMessage,
    });

    await sendSlackMessage(`Pulse check cron failed: ${errorMessage}`);

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
