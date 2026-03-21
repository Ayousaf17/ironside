import { NextResponse } from "next/server";
import { createRouterAgent, AGENT_MODEL, AGENT_TIMEOUT_MS } from "@/lib/langchain/router-agent";
import { sw1ReaderTool } from "@/lib/langchain/tools/sw1-reader";
import { sw3AnalyticsTool } from "@/lib/langchain/tools/sw3-analytics";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "how many open tickets today?";
  const useTools = url.searchParams.get("tools") !== "false";

  const steps: { step: string; ms: number }[] = [];
  const start = Date.now();

  function log(step: string) {
    steps.push({ step, ms: Date.now() - start });
  }

  try {
    log("start");

    const tools = useTools ? [sw1ReaderTool, sw3AnalyticsTool] : [];
    log(`creating agent (${tools.length} tools)`);

    const agent = createRouterAgent(tools);
    log("agent created");

    log("invoking agent...");
    const result = await Promise.race([
      agent.invoke({ messages: [new HumanMessage(query)] }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${AGENT_TIMEOUT_MS}ms`)), AGENT_TIMEOUT_MS)
      ),
    ]);
    log("agent responded");

    const messages = result.messages.map((m: { getType?: () => string; name?: string; content: unknown }) => ({
      type: m.getType?.() ?? "unknown",
      name: m.name,
      contentLength: typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length,
    }));
    log("done");

    const lastMessage = result.messages[result.messages.length - 1];
    const response = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    return NextResponse.json({
      ok: true,
      model: AGENT_MODEL,
      timeoutMs: AGENT_TIMEOUT_MS,
      totalMs: Date.now() - start,
      steps,
      messageCount: messages.length,
      messages,
      response: response.slice(0, 300),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log(`ERROR: ${msg}`);

    return NextResponse.json({
      ok: false,
      model: AGENT_MODEL,
      timeoutMs: AGENT_TIMEOUT_MS,
      totalMs: Date.now() - start,
      steps,
      error: msg,
    }, { status: 500 });
  }
}
