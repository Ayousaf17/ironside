import { createBehaviorLog, createBehaviorLogsBatch } from "@/lib/repos/agent-behavior-log.repo";
import { type BehaviorLogEntry } from "@/lib/gorgias/events";

export async function logBehaviorEntries(entries: BehaviorLogEntry[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    await createBehaviorLog(entry);
    count++;
  }
  return count;
}

export async function backfillBehaviorBatch(entries: BehaviorLogEntry[]): Promise<number> {
  const result = await createBehaviorLogsBatch(entries);
  return result.count;
}
