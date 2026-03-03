import { getContext, upsertContext } from "@/lib/repos/conversation-context.repo";

const CONTEXT_TTL_HOURS = 24;

export async function getThreadContext(threadTs: string) {
  const ctx = await getContext(threadTs);
  if (!ctx) return null;
  if (ctx.expiresAt < new Date()) return null;
  return ctx;
}

export async function updateThreadContext(opts: {
  slackThreadTs: string;
  slackChannel?: string;
  slackUserId?: string;
  lastAction?: string;
  lastTicketIds?: number[];
  pendingConfirmation?: object;
  incrementMessageCount?: boolean;
}) {
  const existing = await getContext(opts.slackThreadTs);
  const messageCount = opts.incrementMessageCount
    ? (existing?.messageCount || 0) + 1
    : existing?.messageCount || 1;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CONTEXT_TTL_HOURS);

  return upsertContext({
    slackThreadTs: opts.slackThreadTs,
    slackChannel: opts.slackChannel,
    slackUserId: opts.slackUserId,
    lastAction: opts.lastAction,
    lastTicketIds: opts.lastTicketIds,
    pendingConfirmation: opts.pendingConfirmation,
    messageCount,
    expiresAt,
  });
}

export function buildContextMessages(
  ctx: { lastAction?: string | null; lastTicketIds?: number[] | null; messageCount?: number | null }
): string {
  const parts: string[] = [];

  if (ctx.lastTicketIds?.length) {
    parts.push(
      `Previous context: the user was looking at ticket(s) ${ctx.lastTicketIds.join(", ")}.`
    );
  }

  if (ctx.lastAction) {
    parts.push(`Their last action was: ${ctx.lastAction}.`);
  }

  if (ctx.messageCount && ctx.messageCount > 1) {
    parts.push(
      `This is message #${ctx.messageCount} in this thread.`
    );
  }

  return parts.length > 0
    ? `[Conversation context]\n${parts.join(" ")}\n\nUse this context to understand follow-up questions like "that ticket", "it", "assign it", etc.`
    : "";
}
