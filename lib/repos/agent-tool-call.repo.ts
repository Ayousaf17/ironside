import { prisma } from "@/lib/prisma";

export function createToolCall(data: {
  requestId: string;
  toolName: string;
  toolInput?: object;
  toolOutput?: object;
  durationMs?: number;
  success?: boolean;
  error?: string;
}) {
  return prisma.agentToolCall.create({ data });
}
