import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";

const SYSTEM_PROMPT = `You are the Ironside support router. Analyze incoming messages and route them to the appropriate tool. Available tools handle: analytics insights, ticket management, and pulse checks.

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
