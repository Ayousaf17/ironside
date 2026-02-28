import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";

const SYSTEM_PROMPT = `You are the Ironside support router. Analyze incoming messages and route them to the appropriate tool.

Available tools:
- sw3_analytics_insights: Run analytics on support tickets (volume, response times, trends, pulse checks)
- sw1_ticket_reader: Search, filter, or look up specific Gorgias tickets by ID, status, or keyword

Use sw1_ticket_reader for requests like "show me ticket #1234", "find open tickets", or "search for shipping issues".
Use sw3_analytics_insights for analytics, summaries, and pulse checks.
When no tool is appropriate, respond directly with helpful information.`;

export function createRouterAgent(tools: StructuredToolInterface[] = []) {
  const llm = new ChatOpenAI({
    model: "anthropic/claude-sonnet-4-5",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

  return createReactAgent({
    llm,
    tools,
    prompt: SYSTEM_PROMPT,
  });
}
