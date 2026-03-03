import { prisma } from "@/lib/prisma";

export function upsertTicketAnalytics(data: {
  ticketId: number;
  category?: string;
  aiConfidenceScore?: number;
  aiClassification?: string;
  humanClassification?: string;
  aiMatchesHuman?: boolean;
  aiMessageCount?: number;
  humanMessageCount?: number;
  resolutionTimeMin?: number;
  costSavingsUsd?: number;
  touchCount?: number;
  wasReopened?: boolean;
}) {
  return prisma.ticketAnalytics.upsert({
    where: { ticketId: data.ticketId },
    update: data,
    create: data,
  });
}

export function getByCategory(category: string) {
  return prisma.ticketAnalytics.findMany({
    where: { category },
    orderBy: { aiConfidenceScore: "desc" },
  });
}

export function getAll() {
  return prisma.ticketAnalytics.findMany({
    orderBy: { updatedAt: "desc" },
  });
}
