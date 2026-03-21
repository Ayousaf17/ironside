# Ironside Experience Redesign — Full Spec

**Date:** 2026-03-21
**Scope:** Dashboard UI + Slack messages + AI agent voice
**Philosophy:** Built with intent. Every pixel, every word, every interaction should feel like someone cared.

---

## 1. Brand Foundation

### Color Tokens (CSS `@theme inline` in globals.css — Tailwind v4 pattern)

Note: This project uses **Tailwind v4** with `@theme inline` in `globals.css`. There is no `tailwind.config.ts`. All custom tokens are registered via CSS `@theme` blocks.

```css
@theme inline {
  --color-ironside-black: #1c1c1c;
  --color-ironside-gold: #bf9c5a;
  --color-ironside-gold-light: #d4b87a;
  --color-ironside-gold-muted: oklch(from #bf9c5a l c h / 0.1);

  --color-status-good: #059669;
  --color-status-warn: #d97706;
  --color-status-bad: #dc2626;
  --color-status-info: #2563eb;
}
```

Slate palette is Tailwind's built-in `slate-*` scale — no custom registration needed.

### Typography

- **Headings:** Geist Sans, semibold/bold, slate-900
- **Body:** Geist Sans, regular, slate-700
- **Data/numbers:** Geist Mono, tabular-nums — ALL metrics, timestamps, IDs, percentages
- **Labels:** Geist Sans, text-xs uppercase tracking-wide, slate-500

Add a utility class in `globals.css` for consistent metric styling:
```css
.metric {
  font-family: var(--font-geist-mono);
  font-variant-numeric: tabular-nums;
}
```

### Elevation System

```
card-base:    shadow-sm border border-slate-200
card-hover:   shadow-md border-slate-300 (transition 150ms)
card-raised:  shadow-lg (alerts, modals)
card-inset:   bg-slate-50 border border-slate-100 (nested sections)
```

---

## 2. Dashboard Redesign

### Architecture

**Replace:** 9 tabs, flat component structure, inline Tailwind
**With:** 4 tabs, design system primitives, CSS Grid layout, Tremor charts

### New Dependencies

```
Keep:    recharts (Tremor depends on it internally as a peer dependency)
Add:     @tremor/react (dashboard charts — built on recharts, Tailwind-native)
Keep:    lucide-react (icons), clsx, tailwind-merge
```

Note: Do NOT remove `recharts` from `package.json`. `@tremor/react` uses recharts internally. Verify peer dependency requirements after install.

### Design System Primitives (new components/ui/)

Existing `components/ui/card.tsx`, `badge.tsx`, `table.tsx` will be **updated in place** to match the new elevation system and brand tokens. New primitives are added alongside them.

| Component | Purpose | New or Updated? |
|-----------|---------|-----------------|
| `MetricCard` | KPI display: icon, value (Geist Mono), label, delta arrow, optional sparkline | New |
| `StatusBadge` | Colored pill: good/warn/bad/info variants | Updated from existing `badge.tsx` |
| `StatusDot` | Tiny colored circle for inline status indicators | New |
| `DataTable` | Sortable table with zebra rows, sticky header, heat-colored cells | Updated from existing `table.tsx` |
| `ChartCard` | Card wrapper for Tremor charts with title, subtitle, optional legend | New |
| `AlertBanner` | Top-of-page alert ribbon: spike, SLA breach, stale tickets | New |
| `SectionHeader` | Section title with optional subtitle and action button | New |
| `ScoreRing` | Circular progress for agent scores (uses composite score from `getAdvancedAnalytics()`: weighted response time + CSAT + escalation rate) and tier progress (uses accuracy % from `getTierReadiness()`) | New |
| `EmptyState` | Illustrated empty state with message and optional CTA | New |
| `DashboardHeader` | Dark branded header bar with system status | New |

### Data Fetching Strategy

**Command Center (Tab 1):** Single fetch to `/api/dashboard/summary` — returns everything pre-computed.

**All other tabs:** Lazy-load on tab activation. Do NOT fetch data for inactive tabs on page load. This is critical for the "load time under 2 seconds" goal. Each tab fetches its data when first activated and caches in React state.

### Tab 1 — Command Center (default)

**Purpose:** "How are we doing right now?" — the first thing Robert sees every morning.

**Layout (CSS Grid):**
```
┌──────────────────────────────────────────────────┐
│  DashboardHeader (dark bar, always visible)       │
│  System: 🟢 Healthy  |  Last pulse: 2h ago       │
├──────────────────────────────────────────────────┤
│  [AlertBanner — only if SLA breaches / spikes]    │
├──────────────────────────────────────────────────┤
│  Tab navigation (4 tabs, gold underline)          │
├─────────┬─────────┬─────────┬─────────┬─────────┤
│MetricCard│MetricCard│MetricCard│MetricCard│MetricCard│
│ Open:12  │ P90:42m │ Spam:31%│ Unasgn:16│ SLA:87% │
├──────────────────────┬───────────────────────────┤
│ AreaChart            │ BarChart                   │
│ Resolution trend     │ Top categories             │
│ (P50/P90, 30 days)  │ (horizontal, sorted)       │
├──────────────────────┴───────────────────────────┤
│ TicketFlowPanel (open → assigned → closed)        │
├──────────────────────────────────────────────────┤
│ OpsNotes (latest insights, collapsible)           │
└──────────────────────────────────────────────────┘
```

**Data source:** `/api/dashboard/summary` (single fetch, typed response)

### Tab 2 — Team

**Purpose:** "Who's performing? Who needs help?"

```
┌──────────────────────────────────────────────────┐
│  Agent Leaderboard                                │
│  ┌─────┬────────┬───────┬────────┬──────┬──────┐ │
│  │Rank │ Agent  │ Score │Actions │ Avg  │ Esc% │ │
│  │ 1.  │Spencer │ ⭐ 82 │  45    │3.2m  │  0%  │ │
│  │ 2.  │Danni   │ ⭐ 78 │  38    │4.1m  │  2%  │ │
│  └─────┴────────┴───────┴────────┴──────┴──────┘ │
│  (response times heat-colored: green→amber→red)   │
├──────────────────────┬───────────────────────────┤
│ WorkloadChart        │ Agent activity timeline    │
│ (stacked bar)        │ (recent actions, scrollable│
└──────────────────────┴───────────────────────────┘
```

**Data source:** `/api/dashboard/team` (new summary endpoint — see Section 3)

### Tab 3 — AI & Automation

**Purpose:** "Is the AI investment paying off? What's ready to automate?"

```
┌─────────┬─────────┬─────────┬─────────┐
│MetricCard│MetricCard│MetricCard│MetricCard│
│Accuracy │Cost/Tkt │TimeSaved│Savings  │
│ 94.2%   │ $0.03   │ 12.4h  │ $142    │
├─────────┴─────────┴─────────┴─────────┤
│  Tier Readiness Grid                   │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Track Ordr│ │Order Vrf │ │Product │ │
│  │ T1 → T2  │ │ T1       │ │ T1     │ │
│  │ [==75%=] │ │ [=40%==] │ │ [20%=] │ │
│  └──────────┘ └──────────┘ └────────┘ │
├────────────────────────────────────────┤
│ Feedback Loop                          │
│ Misclassification matrix + corrections │
├────────────────────────────────────────┤
│ Sentiment Trend (compact bar chart)    │
│ angry | frustrated | happy | neutral   │
└────────────────────────────────────────┘
```

**Data source:** `/api/dashboard/ai` (new summary endpoint — see Section 3)

### Tab 4 — Reports

**Purpose:** "Data for meetings, reviews, and business cases."

```
┌──────────────────────────────────────────────────┐
│  Date range: [7d] [30d] [90d] [All]    [Export CSV]│
├──────────────────────────────────────────────────┤
│  Weekly Rollup Table                              │
│  Week | Tickets | Avg Res | P90 | Spam% | AI Acc │
├──────────────────────────────────────────────────┤
│  Monthly Summary Cards (3 months)                 │
├──────────────────────────────────────────────────┤
│  Daily Volume Table (last 14 days)                │
└──────────────────────────────────────────────────┘
```

**Data source:** `/api/dashboard?tab=reporting` + `?tab=trends` (daily volume)

**CSV Export:** Client-side generation — convert the visible table data to CSV in the browser using a utility function. No new API endpoint needed. For the data volumes in play (max ~90 rows), this is fast and simple.

---

## 3. Data Layer Improvements

### New: `/api/dashboard/summary` endpoint (Command Center)

Single endpoint returning the exact shape the Command Center needs:

```typescript
interface DashboardSummary {
  system: {
    status: 'healthy' | 'degraded' | 'down';
    lastPulse: string;       // ISO timestamp
    queuedOps: number;
  };
  alerts: {
    slaBreaches: number;
    staleTickets: number;
    volumeSpike: {
      detected: boolean;
      multiplier: number;
      currentVolume: number;  // for AlertBanner context
      avgVolume: number;      // for AlertBanner context
    } | null;
  };
  metrics: {
    openTickets: number;
    openDelta: number;       // vs previous pulse
    responseP90Min: number;
    responseP90Delta: number;
    spamPct: number;
    spamDelta: number;
    unassignedPct: number;
    unassignedDelta: number;
    slaCompliancePct: number;  // computed: (totalOpen - breaches) / totalOpen * 100
    slaDelta: number;
  };
  resolutionTrend: { date: string; p50: number; p90: number }[];
  categoryBreakdown: { name: string; count: number }[];
  ticketFlow: { open: number; assigned: number; closed: number; spam: number };
  opsNotes: string[];
}
```

**`slaCompliancePct` computation:** Fetch open tickets from Gorgias, count those exceeding default SLA (4h / 240min without agent response), compute `(total - breaches) / total * 100`. Same logic as daily-standup SLA check, packaged as a percentage.

### New: `/api/dashboard/team` endpoint

Pre-aggregated data for the Team tab (avoids client-side aggregation):

```typescript
interface TeamSummary {
  leaderboard: {
    agent: string; score: number; totalActions: number;
    replies: number; closes: number; escalations: number;
    escalationRate: number; avgResponseMin: number | null; avgCsat: number | null;
  }[];
  workloadByDay: { date: string; agents: Record<string, number> }[];
  recentActivity: {
    agent: string; action: string; ticketId: number;
    ticketSubject: string; occurredAt: string;
  }[];
}
```

### New: `/api/dashboard/ai` endpoint

Pre-aggregated data for the AI & Automation tab (replaces 4 separate fetches):

```typescript
interface AiSummary {
  kpis: {
    accuracy: number | null; judged: number;
    costPerTicket: number | null; totalLlmCost: number;
    totalSavedHours: number | null; savedPerTicketMin: number | null;
    totalCostSavings: number;
  };
  tierReadiness: {
    category: string; tier: string; accuracy: number;
    ticketCount: number; avgConfidence: number;
  }[];
  feedback: {
    overallAccuracy: number | null;
    recentCorrections: { ticketId: number; aiCategory: string; humanCategory: string; correctedAt: string }[];
    matrix: { aiCategory: string; humanCategory: string; count: number }[];
  };
  sentimentTrend: { date: string; angry: number; frustrated: number; happy: number; neutral: number }[];
}
```

### Existing tab endpoints

Old `?tab=` endpoints remain available for backward compatibility but are not used by the new frontend. They can be deprecated in a future cleanup. The `?tab=overview` and `?tab=agents` endpoints are superseded by `/api/dashboard/summary` and `/api/dashboard/team` respectively.

---

## 4. Slack Message Redesign

### Philosophy

Current messages are functional but templated. The redesign makes them:
- **Contextual** — messages reference time of day, recent trends, what happened last
- **Scannable** — key info in the first line, details below
- **Actionable** — every message with a ticket reference has a Reply button
- **Consistent** — unified Block Kit patterns across all message types

### Message Types

**Pulse Check (daily 2 PM)**

Current: Wall of text with emoji headers.

Redesigned:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊  Daily Pulse  ·  Mar 21
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

12 open  ·  34 closed  ·  8 spam auto-closed
P90: 42 min (↓ 8 min from yesterday)

🔥  Top category: Track Order (6 tickets)
⚠️  3 unassigned — need routing

[View Dashboard →]
```

**Escalation Alert**

Redesigned:
```
🚨  SLA Breach  ·  2 tickets over limit

#25412 — "PC won't boot after update"
  Critical SLA (30m) · Open 2.1h · Spencer
  [Reply →]

#25398 — "Missing power cable in box"
  Normal SLA (4h) · Open 6.3h · Unassigned
  [Reply →]  [Assign →]
```

**Daily Standup (9 AM)**

Note: Current daily standup builds Block Kit inline in the route handler. Implementation will first extract a `formatDailyStandupBlocks()` formatter function, then redesign it.

Redesigned:
```
☀️  Morning Brief  ·  Friday, Mar 21

Overnight: 12 agent actions · 3 new tickets
Right now: 8 open tickets · 2 unassigned · 0 SLA breaches

📬  Stale (no response >24h):
  #25380 — "Return request for Titan Pro"
    Danni · 32h since last update  [Reply →]

Everything else looks good. Have a productive day.
```

**New Ticket Triage Card** (distinct from `formatTriageChainBlocks` which handles bulk triage queue)

Redesigned:
```
🎫  New: #25420  ·  Track Order
"Where is my order #95412?"

Sentiment: 😐 Neutral  ·  Priority: Normal
Auto-assigned → Spencer  ·  SLA: 4h

[Reply →]  [Reassign →]  [Wrong Category?]
```

### Voice Principles for All Slack Messages

1. **Lead with the answer, not the context.** "3 SLA breaches" not "I've completed an escalation scan and found..."
2. **Use numbers, not adjectives.** "42 min P90" not "Response times are looking good"
3. **Deltas over absolutes.** "↓ 8 min from yesterday" tells a story; "42 min" is a fact
4. **Conversational where appropriate.** Standup can say "Everything looks good." Alerts should be terse.
5. **Never say "I".** The system reports facts. It doesn't narrate its own actions.
6. **One emoji per section maximum.** Emoji is for visual scanning, not decoration.

---

## 5. AI Agent Voice Redesign

### Current Problem

The LangChain agent responds with generic LLM prose: "I found ticket #25412. The subject is 'PC won't boot after update'. The current status is open and it's assigned to Spencer."

### Redesigned Voice

The agent should sound like a **sharp support ops analyst** — someone who's been watching the queue all day and knows the context.

**Principles:**

1. **Answer first, details second.**
   - Bad: "Let me look that up for you. I found ticket #25412..."
   - Good: "#25412 — 'PC won't boot after update'. Open, assigned to Spencer. Customer sent 3 messages, last one 4h ago. No agent reply yet."

2. **Surface what matters, not everything.**
   - Bad: "The ticket was created on March 20 at 2:14 PM. The channel is email. The tags are: track-order, priority-normal..."
   - Good: "Track Order ticket, normal priority. Customer's been waiting 4h — approaching SLA."

3. **Connect to context.**
   - Bad: "Here are the search results for 'wifi driver'..."
   - Good: "Found 6 tickets matching 'wifi driver' — this has been trending up this week. 4 are assigned to Spencer."

4. **Be direct about problems.**
   - Bad: "The system appears to be experiencing some issues with the Gorgias API."
   - Good: "Gorgias API is down. 3 operations queued for retry. Customer-facing impact: replies won't send until it recovers."

### Implementation

Update the system prompt in `lib/langchain/router-agent.ts` to encode these voice principles. The current system prompt is generic; the new one should include:
- Role: "You are Ironside's support operations analyst"
- Voice rules: answer-first, numbers over adjectives, surface what matters
- Context awareness: reference time of day, recent trends when relevant
- Brevity: Slack messages should be 2-5 lines, not paragraphs

---

## 6. Implementation Order

### Phase 1: Foundation (must do first)
1. Add brand tokens via `@theme inline` in `globals.css` + `.metric` utility class
2. Install Tremor (`@tremor/react`) — verify recharts peer dependency, keep recharts installed
3. Update `Tabs` component first (4 tabs, gold underline) — navigation skeleton before content
4. Build design system primitives (10 components in `components/ui/`)
5. Create `/api/dashboard/summary` endpoint (Command Center data)
6. Create `/api/dashboard/team` endpoint (Team tab data)
7. Create `/api/dashboard/ai` endpoint (AI & Automation tab data)
8. Update system prompt for AI agent voice

### Phase 2: Dashboard (the big visual change)
9. Build `DashboardHeader` (dark branded bar with system status)
10. Build Command Center tab (CSS Grid layout, Tremor charts, lazy data from `/api/dashboard/summary`)
11. Build Team tab (leaderboard + workload from `/api/dashboard/team`)
12. Build AI & Automation tab (tier grid + feedback from `/api/dashboard/ai`)
13. Build Reports tab (date picker + tables + CSV export)
14. Wire up lazy-loading: each tab fetches data on first activation, caches in React state

### Phase 3: Slack Messages
15. Redesign pulse check formatter (`formatPulseCheckBlocks`)
16. Redesign escalation alert formatter (`formatEscalationBlocks`)
17. Extract daily standup blocks into `formatDailyStandupBlocks()` formatter, then redesign
18. Create new `formatNewTicketCard()` for individual triage notifications (separate from `formatTriageChainBlocks`)
19. Update all remaining Slack formatters for voice consistency

### Phase 4: Polish
20. Hover states, transitions, focus rings
21. Mobile responsive grid breakpoints
22. Empty states with illustrations
23. Loading skeletons (not spinners)

---

## 7. Out of Scope

- Dark mode toggle (light mode only, dark header only)
- User authentication (use Vercel password protection)
- Real-time WebSocket updates (polling on page load is fine)
- Custom domain or white-labeling
- PDF export (deferred to future sprint)
- Email digest (requires Resend integration)
- Typed response interfaces for ALL old tab endpoints (only new summary endpoints are fully typed)
- Eliminating `as unknown as` casts in backend Prisma Json columns (inherent to Prisma's `JsonValue` type)

---

## 8. Success Criteria

- Robert opens the dashboard and immediately knows the state of his support operation
- The dashboard feels like it belongs to Ironside — gold accents, branded header, professional aesthetic
- Command Center loads in a single fetch (no 8-way parallel fetch)
- Non-active tabs lazy-load on first click (fast initial page load)
- Slack messages are scannable in 2 seconds — key number + context + action
- The AI agent sounds like a competent analyst, not a chatbot
- All existing tests continue to pass
- Load time stays under 2 seconds
