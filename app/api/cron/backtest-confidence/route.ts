import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertTicketAnalytics } from "@/lib/repos/ticket-analytics.repo";
import { calculateConfidence } from "@/lib/analytics/confidence";
import { logCronError } from "@/lib/services/logging.service";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get behavior logs grouped by ticket
    const logs = await prisma.agentBehaviorLog.findMany({
      orderBy: { occurredAt: "asc" },
    });

    // Group by ticketId
    const byTicket = new Map<number, typeof logs>();
    for (const log of logs) {
      if (!byTicket.has(log.ticketId)) byTicket.set(log.ticketId, []);
      byTicket.get(log.ticketId)!.push(log);
    }

    let processed = 0;

    for (const [ticketId, ticketLogs] of byTicket) {
      // AI classification = category from SW4 triage (most recent)
      const aiClassification = ticketLogs
        .filter((l) => l.category)
        .pop()?.category || null;

      // Human classification = category from human agent actions
      // (when a human manually tags or routes differently)
      const humanActions = ticketLogs.filter(
        (l) => l.agent !== "system" && l.agent !== "ai"
      );
      const humanClassification = humanActions
        .filter((l) => l.category)
        .pop()?.category || null;

      // Calculate confidence based on subject + response text
      const subject = ticketLogs[0]?.ticketSubject || "";
      const responseText = ticketLogs
        .filter((l) => l.responseText)
        .map((l) => l.responseText)
        .join(" ");

      const confidence = aiClassification
        ? calculateConfidence(subject, responseText, aiClassification)
        : 0;

      // Count messages
      const aiMessages = ticketLogs.filter(
        (l) => l.action === "reply" || l.action === "macro_used"
      ).length;
      const humanMessages = humanActions.filter(
        (l) => l.action === "reply" || l.action === "internal_note"
      ).length;

      // Resolution time (first action to last close)
      const closeLog = ticketLogs.find((l) => l.action === "close");
      const firstLog = ticketLogs[0];
      let resolutionTimeMin: number | undefined;
      if (closeLog && firstLog) {
        const diff = closeLog.occurredAt.getTime() - firstLog.occurredAt.getTime();
        resolutionTimeMin = diff / 60000;
      }

      // Touch count = unique actions
      const touchCount = ticketLogs.length;

      // Was reopened
      const wasReopened = ticketLogs.some((l) => l.reopened);

      // Compare AI vs human
      const aiMatchesHuman =
        aiClassification && humanClassification
          ? aiClassification === humanClassification
          : undefined;

      await upsertTicketAnalytics({
        ticketId,
        category: aiClassification || humanClassification || undefined,
        aiConfidenceScore: confidence,
        aiClassification: aiClassification || undefined,
        humanClassification: humanClassification || undefined,
        aiMatchesHuman,
        aiMessageCount: aiMessages,
        humanMessageCount: humanMessages,
        resolutionTimeMin,
        touchCount,
        wasReopened,
      });

      processed++;
    }

    console.log(
      `[cron/backtest-confidence] Processed ${processed} tickets from ${logs.length} behavior logs`
    );
    return NextResponse.json({ ok: true, processed, totalLogs: logs.length });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/backtest-confidence] Error:", errorMessage);

    await logCronError({
      metric: "cron_backtest_confidence_error",
      error: errorMessage,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
