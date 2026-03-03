import { createTokenUsage, getUsageSince } from "@/lib/repos/ai-token-usage.repo";
import { calculateCost } from "@/lib/langchain/pricing";

export async function logTokenUsage(opts: {
  sessionId?: string;
  requestId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  source: string;
}) {
  const totalTokens = opts.promptTokens + opts.completionTokens;
  const costUsd = calculateCost(opts.model, opts.promptTokens, opts.completionTokens);

  return createTokenUsage({
    sessionId: opts.sessionId,
    requestId: opts.requestId,
    model: opts.model,
    promptTokens: opts.promptTokens,
    completionTokens: opts.completionTokens,
    totalTokens,
    costUsd,
    source: opts.source,
  });
}

export async function getDailyCost(): Promise<{
  totalCost: number;
  totalTokens: number;
  count: number;
}> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const rows = await getUsageSince(since);

  return {
    totalCost: rows.reduce((sum, r) => sum + r.costUsd, 0),
    totalTokens: rows.reduce((sum, r) => sum + r.totalTokens, 0),
    count: rows.length,
  };
}

export async function getMonthlyCost(): Promise<{
  totalCost: number;
  totalTokens: number;
  count: number;
}> {
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const rows = await getUsageSince(since);

  return {
    totalCost: rows.reduce((sum, r) => sum + r.costUsd, 0),
    totalTokens: rows.reduce((sum, r) => sum + r.totalTokens, 0),
    count: rows.length,
  };
}
