import { NextResponse } from "next/server";
import { getDailyCost, getMonthlyCost } from "@/lib/services/token.service";
import { sendSlackMessage } from "@/lib/slack/client";
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
    const [daily, monthly] = await Promise.all([
      getDailyCost(),
      getMonthlyCost(),
    ]);

    const summary = [
      `:robot_face: *AI Token Usage Summary*`,
      ``,
      `*Today:* ${daily.count} calls • ${daily.totalTokens.toLocaleString()} tokens • $${daily.totalCost.toFixed(4)}`,
      `*This Month:* ${monthly.count} calls • ${monthly.totalTokens.toLocaleString()} tokens • $${monthly.totalCost.toFixed(4)}`,
    ].join("\n");

    await sendSlackMessage(summary);

    return NextResponse.json({ ok: true, daily, monthly });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/token-summary] Error:", errorMessage);

    await logCronError({
      metric: "cron_token_summary_error",
      error: errorMessage,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
