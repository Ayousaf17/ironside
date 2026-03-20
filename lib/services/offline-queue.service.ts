// Offline queue for Gorgias downtime — stores failed write operations
// in DashboardConfig for later retry. Operations are retried on the
// next successful Gorgias API call or via manual flush.

import { prisma } from "@/lib/prisma";

const QUEUE_KEY = "gorgias_offline_queue";

export interface QueuedOperation {
  id: string;
  operation: string;
  args: unknown[];
  queuedAt: string;
  retryCount: number;
  lastError: string;
}

export async function enqueue(operation: string, args: unknown[], error: string): Promise<void> {
  const entry: QueuedOperation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    operation,
    args,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    lastError: error,
  };

  try {
    const existing = await prisma.dashboardConfig.findUnique({ where: { key: QUEUE_KEY } });
    const queue: QueuedOperation[] = existing ? (existing.value as unknown as QueuedOperation[]) : [];
    queue.push(entry);

    await prisma.dashboardConfig.upsert({
      where: { key: QUEUE_KEY },
      update: { value: queue as unknown as object },
      create: { key: QUEUE_KEY, value: queue as unknown as object },
    });

    console.log(`[offline-queue] Queued ${operation} (${queue.length} total in queue)`);
  } catch (dbErr) {
    console.error("[offline-queue] Failed to enqueue:", dbErr);
  }
}

export async function getQueue(): Promise<QueuedOperation[]> {
  try {
    const config = await prisma.dashboardConfig.findUnique({ where: { key: QUEUE_KEY } });
    return config ? (config.value as unknown as QueuedOperation[]) : [];
  } catch {
    return [];
  }
}

export async function clearQueue(): Promise<void> {
  await prisma.dashboardConfig.upsert({
    where: { key: QUEUE_KEY },
    update: { value: [] },
    create: { key: QUEUE_KEY, value: [] },
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((q) => q.id !== id);
  await prisma.dashboardConfig.upsert({
    where: { key: QUEUE_KEY },
    update: { value: filtered as unknown as object },
    create: { key: QUEUE_KEY, value: filtered as unknown as object },
  });
}
