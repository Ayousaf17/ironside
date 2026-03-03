// Model pricing per million tokens (USD)
// Source: OpenRouter pricing pages
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4-5": { input: 3, output: 15 },
  "anthropic/claude-sonnet-4-20250514": { input: 3, output: 15 },
  "anthropic/claude-haiku-3.5": { input: 0.8, output: 4 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const prices = MODEL_PRICES[model];
  if (!prices) {
    // Conservative fallback: assume Claude Sonnet pricing
    return (promptTokens * 3 + completionTokens * 15) / 1_000_000;
  }
  return (
    (promptTokens * prices.input + completionTokens * prices.output) /
    1_000_000
  );
}
