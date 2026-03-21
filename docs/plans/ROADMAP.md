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

## Sprint 6: Data Accuracy & Hardening

1. ~~Fix resolution time tracking~~ — **DONE** (pulse check now fetches individual ticket messages for closed tickets)
2. ~~Offline queue retry cron~~ — **DONE** (flush-queue runs every 30 min, replays failed Gorgias ops)
3. Dashboard loading skeletons — already has full-page spinner + per-tab error banners

## Sprint 7: Security & Audit Fixes (CRITICAL) — **COMPLETE**

Ref: `memory/project_audit_fixes.md` — go-live audit from 2026-03-19.

1. ~~Rotate all secrets~~ — **NOT APPLICABLE** (.env files never committed to git, verified via git log)
2. ~~Fix `/api/automation` auth~~ — **DONE** (removed CRON_SECRET gate — dashboard calls from browser, same fix as PR #72)
3. ~~Fail closed on missing secrets~~ — **DONE** (Slack signature verification now returns false when secret missing; crons + Gorgias already correct)
4. ~~Gorgias response normalization~~ — **ALREADY HANDLED** (enrich.ts correctly casts tags as objects, write.ts wraps assignee)
5. ~~Wrap LLM call in try/catch~~ — **ALREADY HANDLED** (outer try-catch at line 108, error reply sent to Slack)

## Sprint 8: Production Hardening — **COMPLETE**

Ref: audit HIGH + MEDIUM items + `docs/plans/2026-03-05-richer-api-logs.md`.

1. ~~Dashboard error state UI~~ — **ALREADY HANDLED** (per-tab safeFetch + amber warning banners + full-page error only when all tabs fail)
2. ~~Add database indexes~~ — **ALREADY HANDLED** (@@index([createdAt]) already in Prisma schema on ApiLog, PerformanceMetric, PulseCheck)
3. ~~Update `.env.example`~~ — **ALREADY HANDLED** (CRON_SECRET, GORGIAS_WEBHOOK_SECRET, SLACK_CHANNEL_OPS all present)
4. ~~Enrich API logs~~ — **ALREADY HANDLED** (Slack incoming, Gorgias webhook, and backfill cron all enriched with intent/ticketId/actor)
5. ~~Dashboard API pagination~~ — **DONE** (behavior logs now accept limit/offset params, default 200, max 500, returns total count)
6. Consistent API response shapes — deferred (would break all frontend components; current shapes work fine)
7. ~~Tabs keyboard accessibility~~ — **DONE** (ARIA tablist/tab roles, arrow key nav, Home/End, roving tabindex, overflow-x-auto for mobile)
8. Hardcoded thresholds → DashboardConfig — deferred to Sprint 9+ (lower priority, current thresholds are reasonable)

## Sprint 9: Client Demo Readiness — **COMPLETE**

Goal: Make the dashboard presentable and secure for Robert to access and use daily.

1. Dashboard auth gate — use Vercel Deployment Protection (Settings → General → Password Protection). No code change needed.
2. Dashboard landing page — deferred (Operations tab already serves as the landing view with hero cards)
3. ~~Resolution time data improvement~~ — **DONE** (widened pulse check from 24h to 7 days for closed ticket resolution data)
4. ~~Mobile-responsive dashboard~~ — **DONE** (Sprint 8 added overflow-x-auto on tabs)
5. ~~Branding pass~~ — **DONE** (layout metadata updated: "Ironside Support Command Center", page title corrected)
6. ~~Interactive Slack buttons on all responses~~ — **DONE** (escalation alerts now use Block Kit with Reply buttons per ticket; slash commands, urgent alerts, SLA breaches, and AI agent responses already had buttons)
7. ~~Time filter persistence~~ — **DONE** (tab + period now persist to URL search params via useSearchParams + router.replace)
8. ~~Clean up orphaned components~~ — **DONE** (deleted unused StatsRow.tsx, UsageChart.tsx)

## Sprint 10: Intelligence & Trend Analysis

Goal: Surface patterns the support team can act on before problems escalate.

1. Ticket volume trend charts — daily/weekly volume over 30 days with category breakdown
2. Volume spike detection — alert to Slack when ticket volume exceeds 2x the 7-day rolling average
3. Agent performance scoring — response time, resolution rate, escalation rate per agent
4. Category shift alerts — detect when a category (e.g., "Shipping Delay") suddenly spikes vs historical norm
5. Customer satisfaction trend — aggregate sentiment over time with sparklines on Deep Dive tab

## Sprint 11: Shopify/WooCommerce Integration

Goal: Auto-resolve top ticket categories using real order data. **Blocked until Robert grants API access.**

Pitch context: Top ticket categories (Track Order, Order Verification, Product Questions) can be auto-answered with ecommerce data. Use pulse check data to quantify impact (e.g., "X Track Order tickets/day could be auto-resolved").

1. Shopify API connection — order lookup by email/order number (new LangChain tool: SW7-orders)
2. WooCommerce API connection — parallel implementation
3. "Track My Order" auto-resolve — pull tracking info, compose response, close ticket
4. "Order Verification" auto-resolve — confirm order exists, show status/items
5. "Product Questions" auto-enrichment — pull product details to augment LLM responses
6. Integration health monitoring — API status checks in `/ironside status`

## Sprint 12: Proactive Ops & Notifications

Goal: Push critical information to the team without them asking.

1. SLA breach escalation chain — if first alert ignored for 30min, re-alert with @channel
2. Daily standup summary — auto-post at 9am: overnight tickets, open SLA breaches, queue status
3. Customer follow-up reminders — flag tickets with no response >24h
4. Gorgias downtime auto-recovery — when offline queue flushes successfully, post recovery summary
5. Email digest option — weekly summary email alongside Slack digest (requires email service integration)

## Sprint 13: Advanced Analytics & Reporting

Goal: Data Robert can use for business decisions, team reviews, and pitching next clients.

1. Agent leaderboard — ranked by resolution speed, customer satisfaction, ticket volume
2. Cost-per-ticket calculation — LLM costs / tickets processed, trended over time
3. Time-saved estimation — (avg manual response time − avg AI-assisted time) × ticket count
4. Custom date range picker for all dashboard views
5. Scheduled PDF report export — email weekly/monthly PDF summaries
6. Cohort analysis — repeat customer ticket patterns, resolution effectiveness by category

## Milestone: ironside-analytics Deprecation

Once Sprints 7-13 are complete and the ironside dashboard has been the primary interface for 2+ weeks:

1. Redirect ironside-analytics Gorgias webhook to ironside
2. Migrate any historical data from Supabase → Neon if needed for reporting continuity
3. Archive ironside-analytics repo (read-only)
4. Update DNS / Vercel project settings

## Future: Multi-Client Expansion

Path: Agency retainer ($1-3k/mo) → vertical SaaS → Gorgias marketplace listing.

1. Multi-tenant schema — org_id on all tables (only when client #2 is signed)
2. Onboarding flow — new client setup wizard (Gorgias connect, Slack install, tier config)
3. White-label dashboard — configurable branding per org
4. Pitch deck — use Ironside metrics as case study (time saved, cost per ticket, tier progression)
