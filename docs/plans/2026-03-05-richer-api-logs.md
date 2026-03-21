# Richer api_logs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Populate the existing but empty context fields in `api_logs` (actorUser, slackChannel, slackThreadTs, ticketId, intent, toolsUsed, sessionId) so logs are useful for insights.

**Architecture:** Option A — pass data already in scope at each `logApiCall` site. No schema changes, no new files, no new abstractions. Three files touched.

**Tech Stack:** TypeScript, Next.js route handlers, Prisma

---

### Task 1: Enrich Slack webhook log entry

**Files:**
- Modify: `app/api/webhooks/slack/incoming/route.ts:266-273`

`channel`, `threadTs`, `slackUserId` are already extracted at lines 82-84.
`sessionId`, `toolsUsed` are already in scope from the agent run.

**Step 1: Update the logApiCall call**

Find this block (around line 266):
```typescript
await logApiCall({
  endpoint: "/webhooks/slack/incoming",
  method: "POST",
  status: 200,
  request: body,
  response: { text: responseText },
  duration: Date.now() - startTime,
});
```

Replace with:
```typescript
await logApiCall({
  endpoint: "/webhooks/slack/incoming",
  method: "POST",
  status: 200,
  request: body,
  response: { text: responseText },
  duration: Date.now() - startTime,
  actorUser: slackUserId,
  slackChannel: channel,
  slackThreadTs: threadTs,
  intent: toolsUsed[0] ?? "general_query",
  toolsUsed,
  sessionId,
});
```

**Step 2: Run lint + type check**
```bash
bun run lint && bunx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**
```bash
git add app/api/webhooks/slack/incoming/route.ts
git commit -m "feat: enrich api_logs with slack context (actor, channel, thread, intent)"
```

---

### Task 2: Enrich Gorgias webhook log entries

**Files:**
- Modify: `app/api/webhooks/gorgias/events/route.ts`

Two `logApiCall` calls exist: one for skipped events (line ~34), one for logged events (line ~58).

**Step 1: Update the "skipped" logApiCall (no agent action)**

Find:
```typescript
await logApiCall({
  endpoint: "/api/webhooks/gorgias/events",
  method: "POST",
  status: 200,
  request: { type: eventType, ticket_id: payload.ticket_id },
  response: { skipped: true, reason: "no_agent_action" },
  duration: Date.now() - startTime,
});
```

Replace with:
```typescript
await logApiCall({
  endpoint: "/api/webhooks/gorgias/events",
  method: "POST",
  status: 200,
  request: { type: eventType, ticket_id: payload.ticket_id },
  response: { skipped: true, reason: "no_agent_action" },
  duration: Date.now() - startTime,
  ticketId: payload.ticket_id ? Number(payload.ticket_id) : undefined,
  intent: eventType,
});
```

**Step 2: Update the "logged" logApiCall**

Find:
```typescript
await logApiCall({
  endpoint: "/api/webhooks/gorgias/events",
  method: "POST",
  status: 200,
  request: { type: eventType, ticket_id: payload.ticket_id },
  response: { logged: count, actions: entries.map(e => e.action) },
  duration: Date.now() - startTime,
});
```

Replace with:
```typescript
await logApiCall({
  endpoint: "/api/webhooks/gorgias/events",
  method: "POST",
  status: 200,
  request: { type: eventType, ticket_id: payload.ticket_id },
  response: { logged: count, actions: entries.map(e => e.action) },
  duration: Date.now() - startTime,
  ticketId: payload.ticket_id ? Number(payload.ticket_id) : undefined,
  intent: eventType,
});
```

**Step 3: Run lint + type check**
```bash
bun run lint && bunx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**
```bash
git add app/api/webhooks/gorgias/events/route.ts
git commit -m "feat: enrich api_logs with ticketId and intent for gorgias webhook"
```

---

### Task 3: Enrich backfill cron log entries

**Files:**
- Modify: `app/api/cron/backfill-behavior/route.ts`

**Step 1: Find both logApiCall calls and add intent: "backfill" to each**

There are two calls (success and error paths). Add `intent: "backfill"` to both:
```typescript
intent: "backfill",
```

**Step 2: Run lint + type check**
```bash
bun run lint && bunx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**
```bash
git add app/api/cron/backfill-behavior/route.ts
git commit -m "feat: tag backfill cron api_logs with intent=backfill"
```

---

### Task 4: Push and open PR

```bash
git push origin feature/richer-api-logs
gh pr create --title "feat: enrich api_logs with actor, channel, thread, ticketId, intent" --body "Populates previously-empty context fields in api_logs for better dashboard insights. No schema changes — fields already exist from Phase 3."
```

---

### Verification

After deploying, send a message to the Slack bot and check the DB:

```sql
SELECT actor_user, slack_channel, slack_thread_ts, intent, tools_used, session_id
FROM api_logs
WHERE endpoint = '/webhooks/slack/incoming'
ORDER BY created_at DESC
LIMIT 5;
```

Expected: all columns populated, not null.
