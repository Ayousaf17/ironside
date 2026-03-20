import { NextResponse } from "next/server";
import { createPulseCheck } from "@/lib/repos/pulse-check.repo";
import { logCronError } from "@/lib/services/logging.service";
import { sendSlackBlocks, sendSlackMessage } from "@/lib/slack/client";
import { formatPulseCheckBlocks } from "@/lib/slack/formatters";
import { getTickets } from "@/lib/gorgias/client";
import { calculateAnalytics, type TicketAnalytics } from "@/lib/analytics/calculate";

export const maxDuration = 60;

/** Generate actionable ops notes directly from analytics — no LLM needed. */
function generateOpsNotes(analytics: TicketAnalytics): string[] {
  const notes: string[] = [];

  // Unassigned queue alert
  if (analytics.unassignedCount > 0) {
    const pct = analytics.unassignedRate;
    const severity = pct > 50 ? "Critical" : pct > 25 ? "High" : "Note";
    notes.push(`${severity}: ${analytics.unassignedCount} tickets unassigned (${pct}%) — need routing`);
  }

  // Spam rate
  if (analytics.spamRate > 30) {
    notes.push(`High spam: ${analytics.spamRate}% of volume is non-support — review auto-close filters`);
  }

  // Top category insight
  if (analytics.topQuestions.length > 0) {
    const top = analytics.topQuestions[0];
    const ids = top.ticketIds?.slice(0, 5).map((id) => `#${id}`).join(", ") ?? "";
    notes.push(`Top category: "${top.question}" (${top.count} tickets${ids ? ` — ${ids}` : ""})`);
  }

  // Resolution insight
  if (analytics.p90ResolutionMinutes !== null && analytics.p90ResolutionMinutes > 60) {
    notes.push(`P90 resolution at ${analytics.p90ResolutionMinutes} min — check for bottlenecks`);
  }

  // Open ticket pressure
  if (analytics.openTickets > 0) {
    notes.push(`${analytics.openTickets} tickets still open — ${analytics.closedTickets} closed in this window`);
  }

  return notes.slice(0, 5);
}

/** Build a plain-text summary from analytics for DB storage. */
function buildSummary(analytics: TicketAnalytics, dateRange: string, opsNotes: string[]): string {
  const lines = [
    `Support Pulse Check — ${dateRange}`,
    `${analytics.totalTickets} tickets: ${analytics.openTickets} open, ${analytics.closedTickets} closed`,
    `Spam: ${analytics.spamCount} (${analytics.spamRate}%) | Real: ${analytics.realTickets}`,
    "",
    `Resolution: Avg ${analytics.avgResolutionMinutes ?? "–"}min • P50: ${analytics.p50ResolutionMinutes ?? "–"}min • P90: ${analytics.p90ResolutionMinutes ?? "–"}min`,
    "",
    "Top Questions:",
    ...analytics.topQuestions.slice(0, 3).map((q, i) => `${i + 1}. "${q.question}" — ${q.count} tickets`),
    "",
    "Workload:",
    ...analytics.agentBreakdown.map((a) => `• ${a.agent}: ${a.ticketCount} tickets (${a.closeRate}% close rate)`),
    "",
    "Ops Notes:",
    ...opsNotes.map((n) => `• ${n}`),
  ];
  return lines.join("\n");
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let blocks: object[] = [];

  try {
    // 1. Fetch open + recently closed tickets
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

    // 2. Generate ops notes directly from analytics (no LLM — fast + reliable)
    const opsNotes = generateOpsNotes(analytics);

    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const dateRange = `${fmt(twentyFourHoursAgo)} – ${fmt(now)}`;
    const summary = buildSummary(analytics, dateRange, opsNotes);

    // 3. Send to Slack as Block Kit (with fallback to plain text)
    blocks = formatPulseCheckBlocks({
      summary,
      analytics: {
        ...analytics,
        spamCount: analytics.spamCount,
        unassignedCount: analytics.unassignedCount,
      },
      dateRangeStart: twentyFourHoursAgo,
      dateRangeEnd: now,
    });

    let slackBlocksError: string | null = null;
    try {
      await sendSlackBlocks("📊 Support Pulse Check", blocks, undefined, undefined, "ops");
    } catch (slackErr) {
      const sd = (slackErr as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const msgs = (sd?.response_metadata as Record<string, unknown> | undefined)?.messages;
      slackBlocksError = JSON.stringify(msgs ?? (slackErr instanceof Error ? slackErr.message : slackErr)).slice(0, 500);
      console.error("[pulse-check] BLOCKS_FAILED:", slackBlocksError);
      blocks.forEach((b: object, i: number) => {
        const blk = b as Record<string, unknown>;
        console.error(`[pulse-check] block[${i}]:`, JSON.stringify(blk).slice(0, 300));
      });
      await sendSlackMessage(
        `📊 Pulse Check (blocks failed — detail below)\n\n${summary.slice(0, 2800)}\n\n⚠️ Block error: ${slackBlocksError}`,
        undefined,
        undefined,
        "ops",
      );
    }

    // 4. Persist
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
      insights: { source: "cron", prompt: "pulse-check-v3-no-llm" },
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

    return NextResponse.json({ ok: true, summary, slackBlocksError });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/pulse-check] Error:", errorMessage);

    await logCronError({
      metric: "cron_pulse_check_error",
      error: errorMessage,
    });

    await sendSlackMessage(`Pulse check cron failed: ${errorMessage}`);

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
