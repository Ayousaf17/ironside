import { NextResponse } from "next/server";
import { getQueue, removeFromQueue } from "@/lib/services/offline-queue.service";
import * as write from "@/lib/gorgias/write";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 30;

const OPERATIONS: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  createTicket: (data) => write.createTicket(data as { customer_email: string; subject: string; message: string }),
  assignTicket: (ticketId, email) => write.assignTicket(ticketId as number, email as string),
  setPriority: (ticketId, priority) => write.setPriority(ticketId as number, priority as string),
  setStatus: (ticketId, status) => write.setStatus(ticketId as number, status as "open" | "closed"),
  updateTags: (ticketId, tags) => write.updateTags(ticketId as number, tags as string[]),
  replyPublic: (ticketId, body) => write.replyPublic(ticketId as number, body as string),
  commentInternal: (ticketId, body) => write.commentInternal(ticketId as number, body as string),
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const queue = await getQueue();
    if (queue.length === 0) {
      return NextResponse.json({ ok: true, flushed: 0, remaining: 0 });
    }

    let flushed = 0;
    let failed = 0;

    for (const item of queue) {
      const fn = OPERATIONS[item.operation];
      if (!fn) {
        console.warn(`[flush-queue] Unknown operation: ${item.operation}`);
        await removeFromQueue(item.id);
        continue;
      }

      try {
        await fn(...(item.args as unknown[]));
        await removeFromQueue(item.id);
        flushed++;
        console.log(`[flush-queue] Replayed ${item.operation} (queued ${item.queuedAt})`);
      } catch (err) {
        failed++;
        console.error(`[flush-queue] Failed to replay ${item.operation}:`, err);
        // Leave in queue for next retry
      }
    }

    return NextResponse.json({ ok: true, flushed, failed, remaining: queue.length - flushed });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/flush-queue] Error:", errorMessage);
    await logCronError({ metric: "cron_flush_queue_error", error: errorMessage });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
