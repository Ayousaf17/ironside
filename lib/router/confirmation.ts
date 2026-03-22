import type { ConversationContext } from "@prisma/client";

export interface PendingConfirmation {
  intent: "write";
  operation: string;
  params: Record<string, unknown>;
  description: string;
}

// Operations that require user confirmation before executing
const DESTRUCTIVE_OPS = new Set([
  "close",
  "reply_public",
  "create_ticket",
]);

const CONFIRMATION_PATTERNS = /^(yes|y|confirm|do it|go ahead|approved|proceed|ok|yep|yeah|sure)\s*[.!]?$/i;

export function isConfirmationMessage(message: string): boolean {
  return CONFIRMATION_PATTERNS.test(message.trim());
}

export function requiresConfirmation(operation: string): boolean {
  return DESTRUCTIVE_OPS.has(operation);
}

export function hasPendingConfirmation(context: ConversationContext | null): boolean {
  if (!context?.pendingConfirmation) return false;
  const pending = context.pendingConfirmation as Record<string, unknown>;
  return typeof pending.operation === "string";
}

export function getPendingConfirmation(
  context: ConversationContext | null
): PendingConfirmation | null {
  if (!context?.pendingConfirmation) return null;
  const pending = context.pendingConfirmation as unknown as PendingConfirmation;
  if (!pending.operation) return null;
  return pending;
}

export function createConfirmation(
  operation: string,
  params: Record<string, unknown>,
  description: string
): PendingConfirmation {
  return {
    intent: "write",
    operation,
    params,
    description,
  };
}
