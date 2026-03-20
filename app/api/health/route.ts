import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 10;

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};

  // Database
  const dbStart = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Gorgias API
  const gorgStart = Date.now();
  try {
    const baseUrl = process.env.GORGIAS_BASE_URL?.replace(/\/$/, "");
    const email = process.env.GORGIAS_EMAIL;
    const apiKey = process.env.GORGIAS_API_KEY;
    const mock = (process.env.GORGIAS_MOCK ?? "").trim().toLowerCase() !== "false";

    if (mock) {
      checks.gorgias = { ok: true, latencyMs: 0, error: "mock mode" };
    } else if (!baseUrl || !email || !apiKey) {
      checks.gorgias = { ok: false, latencyMs: 0, error: "missing env vars" };
    } else {
      const encoded = Buffer.from(`${email}:${apiKey}`).toString("base64");
      const res = await fetch(`${baseUrl}/api/tickets?limit=1`, {
        headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" },
      });
      checks.gorgias = {
        ok: res.ok,
        latencyMs: Date.now() - gorgStart,
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      };
    }
  } catch (err) {
    checks.gorgias = {
      ok: false,
      latencyMs: Date.now() - gorgStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Slack API
  const slackStart = Date.now();
  try {
    if (!process.env.SLACK_BOT_TOKEN) {
      checks.slack = { ok: false, latencyMs: 0, error: "missing SLACK_BOT_TOKEN" };
    } else {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      });
      const data = await res.json();
      checks.slack = {
        ok: data.ok === true,
        latencyMs: Date.now() - slackStart,
        ...(data.ok ? {} : { error: data.error }),
      };
    }
  } catch (err) {
    checks.slack = {
      ok: false,
      latencyMs: Date.now() - slackStart,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
