# Ironside — Comprehensive Roadmap

**Data policy:** ALL logs are preserved permanently. No auto-deletion. Data feeds Tier 3 AI training, reporting, and client analytics.

---

## Sprint 1: Stability & Go-Live (before showing client)

1. ~~Remove debug logs (GORGIAS_MOCK console.log)~~ — **DONE** (PR #63)
2. ~~Fix Gorgias API status param rejection~~ — **DONE** (PR #63)
3. Health check endpoint `/api/health` (DB + Gorgias + Slack connectivity)
4. Webhook rate limiting (next-rate-limit already installed, just wire it)
5. LLM agent token limit + timeout in Slack bot (prevent 60s hangs)
6. Per-tab dashboard error handling (one failed tab shouldn't break the rest)

## Sprint 2: Dashboard — The Visual Layer

The dashboard at `app/page.tsx` is a core deliverable. It needs to be client-presentable.

1. **Operations tab** — already working, needs real data flowing (pulse checks with real Gorgias)
2. **Agent Behavior tab** — working, but data comes from backfill cron (now disabled). Wire to webhook-driven behavior logs instead
3. **Automation Control tab** — component exists but NOT wired to API. Connect it
4. **Feedback Loop tab** — working, shows AI correction data
5. **AI Performance tab** — shows token usage/costs. Keep for internal visibility
6. **Deep Dive tab** — charts work but need real data (WorkloadChart, TagTrends, P90Trend)
7. **Add: Reporting view** — exportable summaries for Robert/leadership. Weekly/monthly rollups of ticket volume, resolution times, agent performance, AI accuracy
8. **Add: Tier Readiness view** — show which categories are T3-ready based on accumulated training data

## Sprint 3: Core Slack Value (what the support team uses daily)

1. Per-category SLA tracking + Slack countdown timers
2. Dynamic workload balancing (round-robin, not static routing)
3. Interactive buttons on ALL actionable Slack responses (ticket lookups, AI recommendations, triage cards — not just pulse checks)
4. Bulk spam actions in Slack
5. AI recommendation audit trail (link actions to the AI recommendation that suggested them)

## Sprint 4: Growth & Differentiation

1. Shopify/WooCommerce integration pitch + implementation (auto-resolve Track Order, Order Verification, Product Questions with real order data)
2. Customer sentiment tracking (angry/frustrated/happy flags)
3. /search-ticket slash command
4. Reply draft auto-save
5. Junior→Senior escalation flow
6. Offline queue for Gorgias downtime
7. Cost accountability dashboard for AI spend
