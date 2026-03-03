import { prisma } from "@/lib/prisma";

export function createPerformanceMetric(data: {
  metric: string;
  value: number;
  unit?: string;
  context?: object;
}) {
  return prisma.performanceMetric.create({ data });
}
