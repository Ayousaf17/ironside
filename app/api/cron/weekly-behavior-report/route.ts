import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackMessage } from "@/lib/slack/client";
import { formatWeeklyBehaviorReport } from "@/lib/slack/formatters";
import { logCronError } from "@/lib/services/logging.service";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [behaviorLogs, ticketAnalytics] = await Promise.all([
      prisma.agentBehaviorLog.findMany({
        where: { occurredAt: { gte: weekAgo } },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.ticketAnalytics.findMany({
        where: { createdAt: { gte: weekAgo } },
      }),
    ]);

    const report = formatWeeklyBehaviorReport({
      behaviorLogs,
      ticketAnalytics,
      startDate: weekAgo,
      endDate: now,
    });

    await sendSlackMessage(report);

    return NextResponse.json({
      ok: true,
      stats: {
        behaviorLogs: behaviorLogs.length,
        ticketAnalytics: ticketAnalytics.length,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/weekly-behavior-report] Error:", errorMessage);

    await logCronError({
      metric: "cron_weekly_behavior_report_error",
      error: errorMessage,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
