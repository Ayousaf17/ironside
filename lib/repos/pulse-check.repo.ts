import { prisma } from "@/lib/prisma";

export function createPulseCheck(data: {
  channel?: string;
  summary: string;
  ticketCount?: number | null;
  insights?: object;
  rawAnalytics?: object;
  status?: string;
}) {
  return prisma.pulseCheck.create({ data });
}
