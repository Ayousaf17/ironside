# Ironside — Comprehensive Roadmap

**Data policy:** ALL logs are preserved permanently. No auto-deletion. Data feeds Tier 3 AI training, reporting, and client analytics.

---

## Sprint 1: Stability & Go-Live (before showing client) — **COMPLETE**

1. ~~Remove debug logs (GORGIAS_MOCK console.log)~~ — **DONE** (PR #63)
2. ~~Fix Gorgias API status param rejection~~ — **DONE** (PR #63)
3. ~~Health check endpoint `/api/health`~~ — **DONE** (PR #65)
4. ~~Webhook rate limiting~~ — **DONE** (already wired in middleware.ts)
5. ~~LLM agent token limit + timeout~~ — **DONE** (PR #65)
6. ~~Per-tab dashboard error handling~~ — **DONE** (PR #65)

## Sprint 2: Dashboard — The Visual Layer — **COMPLETE**

All tabs confirmed live with real data. Reporting view added.

1. ~~**Operations tab**~~ — **DONE** (live with pulse cron data)
2. ~~**Agent Behavior tab**~~ — **DONE** (live via Gorgias webhooks)
3. ~~**Automation Control tab**~~ — **DONE** (fully wired to /api/automation)
4. ~~**Feedback Loop tab**~~ — **DONE** (AI accuracy tracking live)
5. ~~**AI Performance tab**~~ — **DONE** (token/cost tracking live)
6. ~~**Deep Dive tab**~~ — **DONE** (charts fed from pulse data)
7. ~~**Reporting view**~~ — **DONE** (PR #66 — weekly/monthly rollups with CSV export)
8. ~~**Tier Readiness view**~~ — **DONE** (covered by Automation Control tab)

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
