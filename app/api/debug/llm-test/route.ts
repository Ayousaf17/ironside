// Temporary debug endpoint — test LLM call directly without Slack/after()
import { NextResponse } from "next/server";
import { createRouterAgent, AGENT_MODEL, AGENT_TIMEOUT_MS } from "@/lib/langchain/router-agent";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 10;

export async function GET() {
  const startTime = Date.now();
  const steps: string[] = [];

  try {
    steps.push(`1. AGENT_MODEL=${AGENT_MODEL}`);
    steps.push(`2. AGENT_TIMEOUT_MS=${AGENT_TIMEOUT_MS}`);
    steps.push(`3. OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY ? "set (" + process.env.OPENROUTER_API_KEY.slice(0, 8) + "...)" : "MISSING"}`);

    // Create agent with no tools (simple test)
    steps.push("4. Creating agent...");
    const agent = createRouterAgent([]);
    steps.push("5. Agent created OK");

    // Invoke with a simple message
    steps.push("6. Invoking agent...");
    const result = await Promise.race([
      agent.invoke({ messages: [new HumanMessage("say hello in 5 words")] }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out after 8s")), 8000)
      ),
    ]);
    steps.push("7. Agent responded OK");

    const lastMessage = result.messages[result.messages.length - 1];
    const responseText = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    steps.push(`8. Response: "${responseText.slice(0, 100)}"`);

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startTime,
      steps,
      response: responseText,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 5) : [];
    steps.push(`ERROR: ${msg}`);

    return NextResponse.json({
      ok: false,
      durationMs: Date.now() - startTime,
      steps,
      error: msg,
      stack,
    }, { status: 500 });
  }
}
