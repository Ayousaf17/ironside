import { NextResponse } from "next/server";
import { upsertGorgiasUser } from "@/lib/repos/gorgias-user.repo";
import { logCronError } from "@/lib/services/logging.service";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip in mock mode — no real Gorgias API to call
  if (process.env.GORGIAS_MOCK !== "false") {
    return NextResponse.json({ ok: true, skipped: "mock_mode" });
  }

  try {
    const baseUrl = process.env.GORGIAS_BASE_URL?.replace(/\/$/, "");
    const email = process.env.GORGIAS_EMAIL;
    const apiKey = process.env.GORGIAS_API_KEY;
    if (!baseUrl || !email || !apiKey) {
      throw new Error("Missing Gorgias env vars");
    }

    const encoded = Buffer.from(`${email}:${apiKey}`).toString("base64");
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Gorgias Users API: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const users = data.data || data;
    let synced = 0;

    for (const user of users) {
      await upsertGorgiasUser({
        gorgiasId: user.id,
        email: user.email,
        firstName: user.firstname || user.first_name,
        lastName: user.lastname || user.last_name,
        role: user.role,
        isActive: user.deactivated_datetime === null,
      });
      synced++;
    }

    console.log(`[cron/sync-gorgias-users] Synced ${synced} users`);
    return NextResponse.json({ ok: true, synced });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/sync-gorgias-users] Error:", errorMessage);

    await logCronError({
      metric: "cron_sync_gorgias_users_error",
      error: errorMessage,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
