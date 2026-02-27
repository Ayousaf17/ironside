import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";

const SYSTEM_PROMPT =
  "You are the Ironside support router. Analyze incoming messages and route them to the appropriate tool. Available tools handle: analytics insights, ticket management, and pulse checks.";

/**
 * Creates a LangChain ReAct router agent backed by Claude Sonnet via OpenRouter.
 *
 * @param tools - Optional array of LangChain tools the agent can invoke.
 * @returns A configured ReactAgent instance with `invoke` and `stream` methods.
 */
export function createRouterAgent(tools: StructuredToolInterface[] = []) {
  const llm = new ChatOpenAI({
    model: "anthropic/claude-sonnet-4-5",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
  });

  return createAgent({
    model: llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });
}
