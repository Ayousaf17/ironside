import { prisma } from "@/lib/prisma";

export function createPulseCheck(data: {
  channel?: string;
  summary: string;
  ticketCount?: number | null;
  insights?: object;
  rawAnalytics?: object;
  status?: string;
  openTickets?: number | null;
  closedTickets?: number | null;
  spamRate?: number | null;
  avgResolutionMin?: number | null;
  topCategory?: string | null;
  // Structured analytics fields for dashboard charting
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  resolutionP50Min?: number | null;
  resolutionP90Min?: number | null;
  ticketsAnalyzed?: number | null;
  unassignedPct?: number | null;
  channelEmail?: number | null;
  channelChat?: number | null;
  workload?: object;
  topQuestions?: object;
  tags?: object;
  opsNotes?: string[];
}) {
  return prisma.pulseCheck.create({ data });
}

export function getRecentPulseChecks(limit = 30) {
  return prisma.pulseCheck.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
