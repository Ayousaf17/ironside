import { NextResponse } from "next/server";
import { deleteExpiredContexts } from "@/lib/repos/conversation-context.repo";
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
    const result = await deleteExpiredContexts();
    console.log(`[cron/cleanup-context] Deleted ${result.count} expired contexts`);
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/cleanup-context] Error:", errorMessage);

    await logCronError({
      metric: "cron_cleanup_context_error",
      error: errorMessage,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
