import { prisma } from "@/lib/prisma";

export function upsertGorgiasUser(data: {
  gorgiasId: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
}) {
  return prisma.gorgiasUser.upsert({
    where: { gorgiasId: data.gorgiasId },
    update: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      isActive: data.isActive,
    },
    create: data,
  });
}

export function getActiveUsers() {
  return prisma.gorgiasUser.findMany({
    where: { isActive: true },
    orderBy: { email: "asc" },
  });
}
