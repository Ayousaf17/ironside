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

## Sprint 3: Core Slack Value (what the support team uses daily) — **COMPLETE**

1. ~~Per-category SLA tracking~~ — **DONE** (SLA targets on triage cards: 30m/2h/4h/8h by priority)
2. ~~Dynamic workload balancing~~ — **DONE** (round-robin for generic categories, load-aware for all)
3. ~~Interactive buttons on ALL actionable Slack responses~~ — **DONE** (Reply buttons on LLM agent responses when tickets referenced)
4. ~~Bulk spam actions in Slack~~ — **DONE** (already existed — spam chain with close-all)
5. ~~AI recommendation audit trail~~ — **DONE** (approval decisions logged to behavior log with reviewer ID)

## Sprint 4: Growth & Differentiation

1. Shopify/WooCommerce integration pitch + implementation — **PENDING** (needs external API access)
2. ~~Customer sentiment tracking~~ — **DONE** (angry/frustrated/happy/neutral detected via regex, shown on triage cards)
3. ~~`/ironside search <keyword>` slash command~~ — **DONE** (searches tickets by subject/tags, shows up to 10 results with Reply buttons)
4. ~~Reply draft auto-save~~ — **DONE** (drafts saved on modal close, restored on reopen, cleared on send)
5. ~~Junior→Senior escalation flow~~ — **DONE** (junior agent tickets auto-escalate to senior after 2h no-response or 8h open)
6. ~~Offline queue for Gorgias downtime~~ — **DONE** (failed write ops queued in DB for retry)
7. ~~Cost accountability dashboard~~ — **DONE** (AI Performance tab already tracks per-request costs, daily/monthly rollups)

## Sprint 5: Client-Ready Polish — **COMPLETE**

1. ~~Weekly Slack digest~~ — **DONE** (re-enabled cron Monday 15:00 UTC, comprehensive behavior report)
2. ~~SLA breach alerts~~ — **DONE** (escalation scan now detects SLA breaches, posts to #alerts with Reply buttons)
3. ~~Spam false positive tracking~~ — **DONE** (reopened auto-close tickets logged as spam_false_positive)
4. ~~Dashboard auth fix~~ — **DONE** (PR #72)
5. ~~`/ironside status` command~~ — **DONE** (checks DB, Gorgias, Slack health + queue status)
6. ~~Escalation scan cron~~ — **DONE** (re-enabled every 4 hours)
