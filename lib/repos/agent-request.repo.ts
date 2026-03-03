import { prisma } from "@/lib/prisma";

export function createRequest(data: {
  sessionId: string;
  model: string;
  promptKey?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  return prisma.agentRequest.create({ data });
}
