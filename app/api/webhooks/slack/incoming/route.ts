import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { sendSlackMessage } from "@/lib/slack/client";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

// Direct LLM chat — no LangChain agent, no tool loop.
// The ReAct agent with 6 tools times out because it enters multi-step
// tool calling loops that exceed 45s. Slash commands handle tool operations.
//
// This handler uses a direct ChatOpenAI call with a context-enriched prompt.
// It pulls latest pulse data from the DB to give the LLM real context.

const llm = new ChatOpenAI({
  model: "anthropic/claude-sonnet-4-5",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
  maxTokens: 1024,
  timeout: 30_000,
});

function verifySlackSignature(rawBody: string, request: NextRequest): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const slackSignature = request.headers.get("x-slack-signature");
  if (!timestamp || !slackSignature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hash = createHmac("sha256", signingSecret).update(baseString).digest("hex");
  return timingSafeEqual(Buffer.from(`v0=${hash}`), Buffer.from(slackSignature));
}

async function getLatestContext(): Promise<string> {
  try {
    const pulse = await prisma.pulseCheck.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        ticketCount: true, openTickets: true, closedTickets: true,
        spamRate: true, unassignedPct: true, resolutionP90Min: true,
        topCategory: true, opsNotes: true, createdAt: true,
      },
    });
    if (!pulse) return "No pulse data available yet. Suggest running /ironside pulse.";

    const notes = (pulse.opsNotes as string[]) ?? [];
    return [
      `LATEST DATA (${pulse.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}):`,
      `${pulse.openTickets ?? 0} open, ${pulse.closedTickets ?? 0} closed, ${pulse.ticketCount ?? 0} total`,
      `Spam: ${pulse.spamRate ?? 0}%, Unassigned: ${pulse.unassignedPct ?? 0}%`,
      pulse.resolutionP90Min ? `P90 resolution: ${pulse.resolutionP90Min} min` : null,
      pulse.topCategory ? `Top category: ${pulse.topCategory}` : null,
      notes.length > 0 ? `Notes: ${notes.join("; ")}` : null,
    ].filter(Boolean).join("\n");
  } catch {
    return "Could not fetch latest data.";
  }
}

const SYSTEM_PROMPT = `You are Ironside Support AI — a sharp ops analyst for Ironside Computers (custom gaming PC builder, 15-20 day build time, DHL shipping).

Team: Spencer (senior), Danni-Jean (verifications/returns), Mackenzie (promotions), Gabe (part-time).

VOICE: Answer first, details second. Use numbers. Be direct. Never say "I". Keep it to 2-5 lines. Suggest one next action.

For ticket-specific operations, direct users to slash commands:
- /ironside ticket <id> — look up a specific ticket
- /ironside search <keyword> — search tickets
- /ironside pulse — run full analytics
- /ironside status — system health
- /ironside stats — latest metrics
- /ironside help — all commands`;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const body = JSON.parse(rawBody);

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }
  if (!verifySlackSignature(rawBody, request)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (request.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true, ignored: "retry" });
  }
  if (body.event?.bot_id || body.event?.subtype) {
    return NextResponse.json({ ok: true, ignored: "bot_or_system_event" });
  }

  const text = (body.event?.text || body.text || "").trim();
  if (!text) {
    return NextResponse.json({ ok: true, ignored: "empty_message" });
  }

  const channel = body.event?.channel;
  const threadTs = body.event?.thread_ts || body.event?.ts;

  // Return 200 immediately, process in background
  after(async () => {
    console.log("[slack/incoming]", text);
    try {
      // Fetch latest pulse data for context
      const context = await getLatestContext();

      const result = await llm.invoke([
        new SystemMessage(`${SYSTEM_PROMPT}\n\n${context}`),
        new HumanMessage(text),
      ]);

      const responseText = typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content);

      await sendSlackMessage(responseText, channel, threadTs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[slack/incoming] Error:", msg);
      await sendSlackMessage(`Error: ${msg}`, channel, threadTs).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}
