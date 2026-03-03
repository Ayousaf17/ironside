import { prisma } from "@/lib/prisma";

export function createApiLog(data: {
  endpoint: string;
  method: string;
  status: number;
  request?: object;
  response?: object;
  error?: string;
  duration?: number;
}) {
  return prisma.apiLog.create({ data });
}
