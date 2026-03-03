import { prisma } from "@/lib/prisma";

export function createTokenUsage(data: {
  sessionId?: string;
  requestId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  source: string;
}) {
  return prisma.aiTokenUsage.create({ data });
}

export function getUsageSince(since: Date) {
  return prisma.aiTokenUsage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}
