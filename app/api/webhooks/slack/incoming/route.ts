import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { sendSlackMessage } from "@/lib/slack/client";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export const maxDuration = 10;

// Use a simple LLM call — no LangChain agent, no tools.
// Tools cause the agent to send all tool definitions to the LLM,
// which makes the prompt too large and response too slow for Hobby plan (10s limit).
// Slash commands (/ironside ticket, /ironside pulse) handle tool-based operations.

const SYSTEM_PROMPT = `You are Ironside Support AI — a sharp, context-aware ops analyst for Ironside Computers (custom gaming PC builder).

Support team: Spencer (senior), Danni-Jean (verifications/returns), Mackenzie (promotions), Gabe (part-time).
Build time: 15-20 business days. Stages: Order Received → Build Queue → Assembly → QC/Testing → Shipping. Carrier: DHL.

Top ticket categories: Track Order (30%), Order Verification (12%), Product Question (12%), Report Issue (8%), Return/Exchange (5%), Spam (30-55%).

VOICE RULES:
- Answer first, details second. Lead with the fact.
- Use numbers not adjectives. Quantify everything.
- Be direct about problems. No hedging.
- Never say "I". Report facts.
- Keep it short. 2-5 lines max.
- Suggest the one most impactful next action.

For ticket lookups, searches, triage, or actions — tell the user to use slash commands:
- /ironside ticket <id> — lookup a ticket
- /ironside search <keyword> — search tickets
- /ironside pulse — run analytics
- /ironside status — system health
- /ironside stats — latest metrics`;

const llm = new ChatOpenAI({
  model: "anthropic/claude-3.5-haiku",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
  maxTokens: 1024,
  timeout: 7000,
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

  console.log("[slack/incoming] Processing:", text);

  try {
    const result = await llm.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(text),
    ]);

    const responseText = typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

    console.log("[slack/incoming] Response:", responseText.slice(0, 100));

    await sendSlackMessage(responseText, channel, threadTs);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[slack/incoming] Error:", msg);

    await sendSlackMessage(`Error: ${msg}`, channel, threadTs).catch(() => {});
    return NextResponse.json({ ok: true });
  }
}
