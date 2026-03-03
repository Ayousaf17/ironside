import { prisma } from "@/lib/prisma";

export function createOutcome(data: {
  sessionId: string;
  success: boolean;
  answer?: string;
  error?: string;
  toolsUsed?: string[];
}) {
  return prisma.agentOutcome.create({ data });
}
