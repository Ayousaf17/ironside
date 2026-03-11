import { prisma } from "@/lib/prisma";

export function createApiLog(data: {
  endpoint: string;
  method: string;
  status: number;
  request?: object;
  response?: object;
  error?: string;
  duration?: number;
  actorUser?: string;
  slackChannel?: string;
  slackThreadTs?: string;
  ticketId?: number;
  intent?: string;
  toolsUsed?: string[];
  sessionId?: string;
}) {
  return prisma.apiLog.create({ data });
}
