import { prisma } from "@/lib/prisma";
import { getTierReadiness } from "@/lib/analytics/tier-readiness";

export interface PendingApproval {
  ticketId: number;
  category: string;
  confidence: number;
  recommendedAction: string;
  agentResponse: string;
  createdAt: string;
}

export async function createApprovalRequest(data: {
  ticketId: number;
  category: string;
  confidence: number;
  recommendedAction: string;
  agentResponse: string;
  slackChannel: string;
  slackThreadTs: string;
}): Promise<void> {
  const pending: PendingApproval = {
    ticketId: data.ticketId,
    category: data.category,
    confidence: data.confidence,
    recommendedAction: data.recommendedAction,
    agentResponse: data.agentResponse,
    createdAt: new Date().toISOString(),
  };

  await prisma.conversationContext.upsert({
    where: { slackThreadTs: data.slackThreadTs },
    update: { pendingConfirmation: pending as object },
    create: {
      slackThreadTs: data.slackThreadTs,
      slackChannel: data.slackChannel,
      pendingConfirmation: pending as object,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

export async function handleApproval(
  slackThreadTs: string,
  approved: boolean,
  reviewerSlackUserId?: string,
): Promise<PendingApproval | null> {
  const ctx = await prisma.conversationContext.findUnique({
    where: { slackThreadTs },
  });

  if (!ctx?.pendingConfirmation) return null;

  const pending = ctx.pendingConfirmation as unknown as PendingApproval;

  // Clear pending confirmation regardless of approve/reject
  await prisma.conversationContext.update({
    where: { slackThreadTs },
    data: { pendingConfirmation: undefined },
  });

  // Audit trail: log the human decision on the AI recommendation
  try {
    await prisma.agentBehaviorLog.create({
      data: {
        action: approved ? "ai_recommendation_approved" : "ai_recommendation_rejected",
        ticketId: pending.ticketId,
        category: pending.category,
        agent: reviewerSlackUserId ? `slack:${reviewerSlackUserId}` : "unknown",
        occurredAt: new Date(),
        rawEvent: {
          recommendedAction: pending.recommendedAction,
          confidence: pending.confidence,
          aiResponse: pending.agentResponse.slice(0, 500),
          decision: approved ? "approved" : "rejected",
          decidedAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error("[approval] Failed to log audit trail:", err);
  }

  return approved ? pending : null;
}

export async function getCategoryTier(
  category: string
): Promise<"T1" | "T2" | "T3" | "insufficient_data"> {
  const readiness = await getTierReadiness();
  const match = readiness.find((r) => r.category === category);
  return match?.tier || "T1";
}
