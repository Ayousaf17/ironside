import { prisma } from "@/lib/prisma";

export function getConfig(key: string) {
  return prisma.dashboardConfig.findUnique({ where: { key } });
}

export function setConfig(key: string, value: object) {
  return prisma.dashboardConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
