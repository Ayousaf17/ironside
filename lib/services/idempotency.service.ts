// Idempotency service — prevents duplicate processing of retried webhook events.
// Uses an in-process Map with TTL expiry. Keyed by event type + ticket ID.
// TTL of 10 minutes covers Gorgias's retry window without growing unbounded.

const cache = new Map<string, number>();

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isDuplicate(key: string): boolean {
  const expiresAt = cache.get(key);
  if (expiresAt === undefined) return false;
  if (Date.now() > expiresAt) {
    cache.delete(key);
    return false;
  }
  return true;
}

export function markSeen(key: string): void {
  cache.set(key, Date.now() + TTL_MS);
}

export function webhookKey(eventType: string, ticketId: string | number): string {
  return `${eventType}:${ticketId}`;
}
