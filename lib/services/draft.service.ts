// Reply draft persistence — saves unsent reply text so agents
// don't lose work when closing the modal accidentally.
// Uses DashboardConfig with key "reply_drafts" (JSON map of ticketId → draft text).

import { prisma } from "@/lib/prisma";

const DRAFTS_KEY = "reply_drafts";

async function getDraftsMap(): Promise<Record<string, string>> {
  try {
    const config = await prisma.dashboardConfig.findUnique({ where: { key: DRAFTS_KEY } });
    return config ? (config.value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveDraftsMap(drafts: Record<string, string>): Promise<void> {
  await prisma.dashboardConfig.upsert({
    where: { key: DRAFTS_KEY },
    update: { value: drafts },
    create: { key: DRAFTS_KEY, value: drafts },
  });
}

export async function saveDraft(ticketId: number, text: string): Promise<void> {
  if (!text.trim()) return;
  const drafts = await getDraftsMap();
  drafts[String(ticketId)] = text;
  await saveDraftsMap(drafts);
}

export async function getDraft(ticketId: number): Promise<string | null> {
  const drafts = await getDraftsMap();
  return drafts[String(ticketId)] ?? null;
}

export async function clearDraft(ticketId: number): Promise<void> {
  const drafts = await getDraftsMap();
  delete drafts[String(ticketId)];
  await saveDraftsMap(drafts);
}
