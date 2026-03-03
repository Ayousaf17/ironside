import { prisma } from "@/lib/prisma";

export function getContext(slackThreadTs: string) {
  return prisma.conversationContext.findUnique({
    where: { slackThreadTs },
  });
}

export function upsertContext(data: {
  slackThreadTs: string;
  slackChannel?: string;
  slackUserId?: string;
  lastAction?: string;
  lastTicketIds?: number[];
  pendingConfirmation?: object;
  messageCount?: number;
  expiresAt: Date;
}) {
  return prisma.conversationContext.upsert({
    where: { slackThreadTs: data.slackThreadTs },
    update: {
      lastAction: data.lastAction,
      lastTicketIds: data.lastTicketIds,
      pendingConfirmation: data.pendingConfirmation,
      messageCount: data.messageCount,
      expiresAt: data.expiresAt,
    },
    create: data,
  });
}

export function deleteExpiredContexts() {
  return prisma.conversationContext.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
