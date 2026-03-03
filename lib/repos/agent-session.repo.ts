import { prisma } from "@/lib/prisma";

export function createSession(data: {
  slackChannel?: string;
  slackThreadTs?: string;
  slackUserId?: string;
  userMessage: string;
}) {
  return prisma.agentSession.create({ data });
}

export function updateSession(
  id: string,
  data: { status?: string; durationMs?: number }
) {
  return prisma.agentSession.update({ where: { id }, data });
}
