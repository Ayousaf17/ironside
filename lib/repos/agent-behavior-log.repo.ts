import { prisma } from "@/lib/prisma";
import { type BehaviorLogEntry } from "@/lib/gorgias/events";

export function createBehaviorLog(entry: BehaviorLogEntry) {
  return prisma.agentBehaviorLog.create({
    data: entryToData(entry),
  });
}

export async function createBehaviorLogSkipDuplicates(entry: BehaviorLogEntry): Promise<boolean> {
  try {
    await createBehaviorLog(entry);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint")) return false;
    throw err;
  }
}

function entryToData(entry: BehaviorLogEntry) {
  return {
    gorgiasEventId: entry.gorgiasEventId,
    agent: entry.agent,
    action: entry.action,
    ticketId: entry.ticketId,
    ticketSubject: entry.ticketSubject,
    category: entry.category,
    responseText: entry.responseText,
    macroIdUsed: entry.macroIdUsed,
    tagsApplied: entry.tagsApplied,
    reopened: entry.reopened,
    rawEvent: entry.rawEvent as object,
    occurredAt: entry.occurredAt,
    agentEmail: entry.agentEmail,
    ticketChannel: entry.ticketChannel,
    ticketTags: entry.ticketTags || [],
    responseCharCount: entry.responseCharCount,
    messagePosition: entry.messagePosition,
    isFirstResponse: entry.isFirstResponse,
  };
}

export function createBehaviorLogsBatch(entries: BehaviorLogEntry[]) {
  return prisma.agentBehaviorLog.createMany({
    data: entries.map(entryToData),
    skipDuplicates: true,
  });
}
