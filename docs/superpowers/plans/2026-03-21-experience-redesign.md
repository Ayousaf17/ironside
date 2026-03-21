# Ironside Experience Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Ironside dashboard from a functional prototype into a branded, intentional product experience — across dashboard UI, Slack messages, and AI agent voice.

**Architecture:** Replace 9-tab dashboard with 4 consolidated views backed by 3 new typed summary API endpoints. Swap inline Tailwind for a 10-component design system with Ironside brand tokens. Replace recharts with Tremor (dynamically imported per tab). Redesign all Slack Block Kit formatters with a scannable, numbers-first voice using shared builder utilities. Update the LangChain system prompt with ops analyst persona.

**Tech Stack:** Next.js 16, Tailwind v4 (`@theme inline`), `@tremor/react`, `lucide-react`, Prisma, LangChain, Slack Block Kit

**Spec:** `docs/superpowers/specs/2026-03-21-experience-redesign.md`

---

## Design Constraints

### Viewport Budget (Command Center)

The first viewport (~700px on 1080p) must fit without scrolling:

```
DashboardHeader:     56px
AlertBanner:         48px (conditional — 0px if no alerts)
Tab bar:             48px
Gap:                 16px
MetricCard row:      120px
Gap:                 24px
First chart (top):   ~388px visible (enough to see chart header + first data)
────────────────────────────
Total:               700px
```

Everything below the metric cards is "below the fold" — still important, but the user gets the critical picture from header + alerts + metrics alone.

### Color Usage Rules

- **Gold `#bf9c5a`**: ONLY for emphasis — active tab indicator, key metric highlights, primary CTA buttons, ScoreRing. **NEVER for body text** (fails WCAG AA at 3.6:1 on white).
- **Slate-900 `#0f172a`**: Headings
- **Slate-700 `#334155`**: Body text (7.5:1 on white — WCAG AAA)
- **Slate-500 `#64748b`**: Secondary text, labels (4.6:1 on white — WCAG AA)
- **White on ironside-black**: Header text (18:1 — excellent)
- **Status colors**: Only in StatusBadge/StatusDot backgrounds, never as text color on white background
- **Heat-colored cells** (response times): Always pair with a secondary indicator (e.g., arrow icon or text label) for colorblind accessibility

### Design System Rules

| Token | Value | Usage |
|-------|-------|-------|
| Border radius | `rounded-xl` (12px) on cards, `rounded-lg` (8px) on badges/inputs, `rounded-full` on dots/pills | Consistent — no mixing |
| Card padding | `p-5` (compact) or `p-6` (standard) | MetricCard=p-5, ChartCard/Section=p-6 |
| Section gap | `space-y-6` | Between sections within a tab |
| Grid gap | `gap-4` for metric cards, `gap-6` for chart grid | Two levels only |
| Shadow | `shadow-sm` default, `shadow-md` on hover, `shadow-lg` for alerts | Three levels only |
| Transitions | `duration-150` for hover/focus, `duration-300` for layout shifts | Two speeds only |

### Data Freshness

Every tab must display when its data was last computed. Format: absolute time "Data from 2:00 PM" (not "2h ago" — relative is ambiguous for stale data). The DashboardHeader shows the last pulse timestamp. Tab-specific freshness comes from the API response.

---

## File Structure

### New Files
```
app/api/dashboard/summary/route.ts        — Command Center summary endpoint
app/api/dashboard/team/route.ts           — Team tab summary endpoint
app/api/dashboard/ai/route.ts             — AI & Automation tab summary endpoint
components/ui/metric-card.tsx              — KPI card with icon, value, delta, optional SparkChart
components/ui/status-badge.tsx             — Colored pill (good/warn/bad/info)
components/ui/status-dot.tsx               — Tiny colored circle for inline status
components/ui/chart-card.tsx               — Wrapper for Tremor charts with title + freshness
components/ui/alert-banner.tsx             — Top-of-page alert ribbon
components/ui/section-header.tsx           — Section title + optional action
components/ui/score-ring.tsx               — Circular progress indicator
components/ui/empty-state.tsx              — Illustrated empty state
components/ui/dashboard-header.tsx         — Dark branded header bar with absolute timestamp
components/ui/tab-skeleton.tsx             — Per-tab loading skeleton (metric cards + chart placeholders)
components/dashboard/CommandCenterTab.tsx   — New consolidated tab 1
components/dashboard/TeamTab.tsx           — New consolidated tab 2
components/dashboard/AiAutomationTab.tsx   — New consolidated tab 3
components/dashboard/ReportsTab.tsx        — New consolidated tab 4
lib/utils/csv-export.ts                   — Client-side CSV generation utility
lib/slack/blocks.ts                        — Shared Block Kit builder utilities (ticketBlock, metricLine, actionRow)
lib/slack/formatters/pulse.ts             — Redesigned pulse check formatter
lib/slack/formatters/escalation.ts        — Redesigned escalation formatter
lib/slack/formatters/standup.ts           — New standup formatter (extracted from route)
lib/slack/formatters/triage-card.ts       — New individual ticket triage card
```

### Modified Files
```
app/globals.css                            — Brand tokens via @theme inline + .metric class + @media print
app/page.tsx                               — Complete rewrite: 4 tabs, dynamic imports, lazy loading
components/dashboard/Tabs.tsx              — 4 tabs with gold underline indicator
components/ui/badge.tsx                    — Update to match brand status colors
components/ui/table.tsx                    — Update with zebra rows, sticky header, heat-color support
lib/langchain/router-agent.ts             — Updated system prompt with voice principles
app/api/cron/pulse-check/route.ts         — Use new pulse formatter (import from formatters/pulse)
app/api/cron/escalation-scan/route.ts     — Use new escalation formatter (import from formatters/escalation)
app/api/cron/daily-standup/route.ts       — Use new standup formatter (import from formatters/standup)
lib/slack/handlers/auto-triage.ts         — Use new triage card formatter
```

### Legacy Formatter Migration Plan

`lib/slack/formatters.ts` (800+ lines) contains these exported functions:

| Function | Action | Destination |
|----------|--------|-------------|
| `formatPulseCheckBlocks` | MOVE | `lib/slack/formatters/pulse.ts` (rewritten) |
| `formatWeeklyBehaviorReport` | KEEP | stays in `formatters.ts` (not redesigned in this sprint) |
| `formatEscalationAlert` | MOVE | `lib/slack/formatters/escalation.ts` (rewritten) |
| `formatEscalationBlocks` | MOVE | `lib/slack/formatters/escalation.ts` (rewritten) |
| `formatUrgentTicketBlocks` | KEEP | stays in `formatters.ts` (already has good buttons) |
| `formatApprovalBlocks` | KEEP | stays in `formatters.ts` |
| `formatTriageChainBlocks` | KEEP | stays in `formatters.ts` (bulk triage — separate from individual card) |
| `buildSummary` (internal) | KEEP | stays in `formatters.ts` |

After migration, old `formatters.ts` re-exports moved functions for backward compatibility:
```ts
export { formatPulseCheckBlocks } from './formatters/pulse';
export { formatEscalationAlert, formatEscalationBlocks } from './formatters/escalation';
```

### Removed After Migration
```
components/dashboard/PulseHeroCards.tsx       — Replaced by MetricCard in CommandCenterTab
components/dashboard/ResolutionChart.tsx      — Replaced by Tremor AreaChart
components/dashboard/RatesTrendChart.tsx      — Replaced by Tremor AreaChart
components/dashboard/TopCategories.tsx        — Replaced by Tremor BarList
components/dashboard/OpsNotes.tsx             — Inlined in CommandCenterTab (collapsible)
components/dashboard/WorkloadChart.tsx        — Replaced by Tremor BarChart
components/dashboard/TagTrendsChart.tsx       — Absorbed into Tremor charts
components/dashboard/P90TrendChart.tsx        — Absorbed into resolution trend
components/dashboard/OpsNotesHistory.tsx      — Absorbed into ReportsTab
components/dashboard/TicketFlowPanel.tsx      — Rebuilt as horizontal segmented bar
components/dashboard/AgentBehaviorTab.tsx     — Replaced by TeamTab
components/dashboard/AutomationControlTab.tsx — Absorbed into AiAutomationTab (tier overrides preserved)
components/dashboard/TierReadinessTab.tsx     — Absorbed into AiAutomationTab
components/dashboard/AiPerformanceTab.tsx     — Absorbed into AiAutomationTab
components/dashboard/FeedbackLoopTab.tsx      — Absorbed into AiAutomationTab
components/dashboard/ReportingTab.tsx         — Replaced by ReportsTab
```

**Note on AutomationControlTab:** The tier override functionality (set-tier, clear-tier, update-routing) moves into the AiAutomationTab. The tier readiness grid will have "Override Tier" buttons on each category card that open inline controls. The `/api/automation` POST endpoint stays as-is.

---

## Phase 1: Foundation

### Task 1: Brand Tokens + Design Rules

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add Ironside brand tokens to globals.css**

Add inside the existing `@theme inline` block:
```css
@theme inline {
  /* Existing font vars stay */
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;

  /* Ironside brand */
  --color-ironside-black: #1c1c1c;
  --color-ironside-gold: #bf9c5a;
  --color-ironside-gold-light: #d4b87a;

  /* Status colors */
  --color-status-good: #059669;
  --color-status-warn: #d97706;
  --color-status-bad: #dc2626;
  --color-status-info: #2563eb;
}
```

Add after the `@theme` block:
```css
/* Metric typography — used on all numbers, timestamps, IDs */
.metric {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/* Print styles — hide dark header, force white backgrounds */
@media print {
  .no-print { display: none !important; }
  header { background: white !important; color: black !important; }
  * { box-shadow: none !important; }
}
```

- [ ] **Step 2: Verify tokens resolve**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**
```
git add app/globals.css
git commit -m "feat(design): add Ironside brand tokens, .metric class, and print styles"
```

---

### Task 2: Install Tremor

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @tremor/react**

Run: `npm install @tremor/react`

- [ ] **Step 2: Verify install and peer deps**

Run: `npm ls recharts @tremor/react`
Expected: Both installed. recharts remains (Tremor peer dep). No warnings.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**
```
git add package.json package-lock.json
git commit -m "feat(design): install @tremor/react for dashboard charts"
```

---

### Task 3: Update Tabs Component (4 tabs, gold underline)

**Files:**
- Modify: `components/dashboard/Tabs.tsx`

- [ ] **Step 1: Rewrite Tabs with 4 tabs and gold active indicator**

4 tabs: Command Center, Team, AI & Automation, Reports.
Gold underline on active tab (not pill). ARIA roles preserved. Arrow key nav preserved.
Border bottom on container. `whitespace-nowrap` on labels. `overflow-x-auto` for mobile.

The active indicator uses `bg-ironside-gold` (class from brand tokens).

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**
```
git add components/dashboard/Tabs.tsx
git commit -m "feat(design): 4-tab navigation with gold underline indicator"
```

---

### Task 4: Build Design System Primitives

**Files:**
- Create: `components/ui/metric-card.tsx`
- Create: `components/ui/status-badge.tsx`
- Create: `components/ui/status-dot.tsx`
- Create: `components/ui/chart-card.tsx`
- Create: `components/ui/alert-banner.tsx`
- Create: `components/ui/section-header.tsx`
- Create: `components/ui/score-ring.tsx`
- Create: `components/ui/empty-state.tsx`
- Create: `components/ui/dashboard-header.tsx`
- Create: `components/ui/tab-skeleton.tsx`
- Modify: `components/ui/badge.tsx` (update variants)
- Modify: `components/ui/table.tsx` (update styling)

All components follow the Design System Rules from the constraints section. Key specifications:

**MetricCard:** Uses `p-5`, `rounded-xl`, `shadow-sm`. Value in `.metric` class (Geist Mono, tabular-nums). Delta arrow colored by `status-good`/`status-bad`. Optional Tremor `SparkChart` (mini sparkline). Icon from lucide-react.

**DashboardHeader:** Shows absolute timestamp — "Data from 2:00 PM" not "2h ago". Uses `bg-ironside-black text-white`. StatusDot with pulse animation when degraded/down. Height: 56px (per viewport budget).

**AlertBanner:** Height: 48px per alert. Three types: spike (amber), sla (red), stale (orange). Each has icon + message. Wraps in `flex-wrap gap-2`.

**TabSkeleton:** Pulsing gray rectangles matching the shape of each tab's content. Command Center skeleton: 5 metric card placeholders (h-28) + 2 chart placeholders (h-64). Generic enough to use for all tabs.

**DataTable (updated table.tsx):** Zebra rows (`even:bg-slate-50`). Sticky header. Heat-colored cells: response times use `bg-emerald-50`/`bg-amber-50`/`bg-red-50` backgrounds PLUS arrow icons (up=bad, down=good) for colorblind accessibility. Sortable column headers (click to sort, icon indicates direction).

- [ ] **Step 1: Create all 10 new components + update 2 existing**

Each component is a single file under 80 lines. Props are typed with explicit interfaces. No `any` types. All use brand tokens from globals.css.

- [ ] **Step 2: Verify all components compile**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**
```
git add components/ui/
git commit -m "feat(design): add 12 design system primitives (10 new + 2 updated)"
```

---

### Task 5: Create /api/dashboard/summary Endpoint

**Files:**
- Create: `app/api/dashboard/summary/route.ts`

- [ ] **Step 1: Create the summary endpoint**

Returns `DashboardSummary` interface (see spec Section 3). Key computations:
- Fetch latest 2 PulseChecks for current + delta values
- Fetch open tickets from Gorgias for SLA compliance: `(total - breaches) / total * 100`
- SLA breach = open ticket > 240min without agent response (same logic as daily-standup)
- Read `gorgias_offline_queue` from DashboardConfig for queuedOps
- Spike detection: latest pulse ticketCount vs 7-day average (from previous pulses)
- `resolutionTrend`: map last 30 PulseChecks to `{ date, p50, p90 }`
- `categoryBreakdown`: from latest pulse's `topQuestions` field
- Include `lastPulse` as ISO timestamp for the DashboardHeader freshness display
- All queries in parallel with `Promise.all`

No auth (same pattern as `/api/dashboard` — single-tenant internal tool).

- [ ] **Step 2: Add `maxDuration = 30`**

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```
git add app/api/dashboard/summary/route.ts
git commit -m "feat(api): add /api/dashboard/summary endpoint for Command Center"
```

---

### Task 6: Create /api/dashboard/team Endpoint

**Files:**
- Create: `app/api/dashboard/team/route.ts`

- [ ] **Step 1: Create the team endpoint**

Returns `TeamSummary` interface (see spec Section 3). Pre-aggregates:
- Leaderboard: composite score from response time + CSAT + escalation rate (same algorithm as existing `getAdvancedAnalytics()`)
- Workload by day: group AgentBehaviorLog by agent + date, count actions per day
- Recent activity: last 50 agent actions with ticket subject

30-day window. All queries in parallel.

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`
```
git add app/api/dashboard/team/route.ts
git commit -m "feat(api): add /api/dashboard/team endpoint for Team tab"
```

---

### Task 7: Create /api/dashboard/ai Endpoint

**Files:**
- Create: `app/api/dashboard/ai/route.ts`

- [ ] **Step 1: Create the AI summary endpoint**

Returns `AiSummary` interface (see spec Section 3). Combines logic from:
- `getAdvancedAnalytics()` → KPIs (accuracy, cost/ticket, time saved, savings)
- `getTierReadiness()` → tier readiness grid
- `getFeedbackLoop()` → feedback matrix + recent corrections
- `getTrends()` → sentiment by day

30-day window. All queries in parallel.

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit`
```
git add app/api/dashboard/ai/route.ts
git commit -m "feat(api): add /api/dashboard/ai endpoint for AI & Automation tab"
```

---

### Task 8: Slack Block Kit Builder Utilities

**Files:**
- Create: `lib/slack/blocks.ts`

- [ ] **Step 1: Create shared Block Kit builder functions**

```typescript
// Reusable ticket reference block — used in pulse, escalation, standup, triage
export function ticketBlock(opts: {
  ticketId: number; subject: string; detail: string;
  assignee?: string; buttons?: { text: string; actionId: string; value?: string; style?: 'primary' | 'danger' }[];
}): object[]

// Reusable metric line for mrkdwn sections
export function metricLine(label: string, value: string | number, delta?: { value: number; unit?: string; inverted?: boolean }): string

// Reusable action button row
export function actionRow(buttons: { text: string; actionId: string; value: string; style?: 'primary' | 'danger' }[]): object

// Header block
export function headerBlock(text: string): object

// Context block (small gray text)
export function contextBlock(text: string): object

// Divider
export function dividerBlock(): object
```

These are the Slack equivalent of the dashboard design system. Every formatter composes from these primitives instead of manually constructing Block Kit JSON.

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**
```
git add lib/slack/blocks.ts
git commit -m "feat(slack): add shared Block Kit builder utilities for DRY formatters"
```

---

### Task 9: Update AI Agent Voice

**Files:**
- Modify: `lib/langchain/router-agent.ts`

- [ ] **Step 1: Add voice principles to SYSTEM_PROMPT**

After the existing `RESPONSE RULES:` section, add a `VOICE & TONE:` section encoding:

1. Answer first, details second (lead with the fact)
2. Use numbers, not adjectives (quantify everything)
3. Surface what matters (skip irrelevant fields)
4. Connect to context (reference trends, team state)
5. Be direct about problems (no hedging)
6. Never say "I" (system reports facts)
7. Keep it short (2-5 lines)
8. Suggest specific next steps (one most impactful action)

Include good/bad examples for each principle (see spec Section 5).

- [ ] **Step 2: Run existing tests**

Run: `npx jest --passWithNoTests`
Expected: 48/48 pass

- [ ] **Step 3: Commit**
```
git add lib/langchain/router-agent.ts
git commit -m "feat(voice): add ops analyst persona and voice principles to system prompt"
```

---

## Phase 2: Dashboard

### Task 10: Build Command Center Tab

**Files:**
- Create: `components/dashboard/CommandCenterTab.tsx`

- [ ] **Step 1: Build the Command Center component**

Receives `DashboardSummary` as typed prop. No data fetching inside — parent handles it.

Sections (in viewport priority order):
1. `AlertBanner` — SLA breaches, volume spikes, stale tickets (conditional, 0px if none)
2. 5 `MetricCard`s in grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4`
   - Open Tickets (icon: Ticket), P90 Response (icon: Clock, deltaInverted), Spam Rate (icon: ShieldX, deltaInverted), Unassigned (icon: UserX, deltaInverted), SLA Compliance (icon: CheckCircle)
3. Two-column chart grid: `grid-cols-1 md:grid-cols-2 gap-6`
   - Left: `ChartCard` with Tremor `AreaChart` — P50/P90 resolution trend (gradient fill, reference line at SLA target)
   - Right: `ChartCard` with Tremor `BarList` — category breakdown (horizontal bars, sorted by count)
4. Ticket flow — horizontal segmented bar showing open → assigned → closed → spam proportions
5. Ops notes — collapsible section, latest pulse insights

All Tremor chart imports use `next/dynamic` with `{ ssr: false }` to avoid SSR issues and code-split chart bundles.

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**
```
git add components/dashboard/CommandCenterTab.tsx
git commit -m "feat(dashboard): build Command Center tab with Tremor charts and alert ribbon"
```

---

### Task 11: Build Team Tab

**Files:**
- Create: `components/dashboard/TeamTab.tsx`

- [ ] **Step 1: Build the Team component**

Receives `TeamSummary` as typed prop.

Sections:
1. Agent leaderboard — `DataTable` sorted by score descending. Columns: Rank (#), Agent, Score (with `ScoreRing`), Actions, Replies, Closes, Esc Rate, Avg Response (heat-colored: <5m green, 5-15m amber, >15m red — with arrow icons for colorblind), CSAT.
2. Workload chart — `ChartCard` with Tremor `BarChart` (stacked by agent, daily over 14 days). Dynamically imported.
3. Recent activity — scrollable list, max-height with overflow. Each entry: agent name, action badge, ticket #subject, relative time.

- [ ] **Step 2: Verify and commit**
```
git add components/dashboard/TeamTab.tsx
git commit -m "feat(dashboard): build Team tab with leaderboard and workload chart"
```

---

### Task 12: Build AI & Automation Tab

**Files:**
- Create: `components/dashboard/AiAutomationTab.tsx`

- [ ] **Step 1: Build the AI & Automation component**

Receives `AiSummary` as typed prop.

Sections:
1. 4 `MetricCard`s: AI Accuracy, Cost/Ticket, Time Saved, Cost Savings
2. Tier readiness grid — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`. Each category card shows: category name, current tier badge, `ScoreRing` with accuracy %, ticket count, "Override Tier" button (opens inline select that POSTs to `/api/automation` with action "set-tier")
3. Feedback loop — `SectionHeader` + misclassification matrix table + recent corrections list
4. Sentiment trend — `ChartCard` with Tremor stacked `AreaChart` (angry/frustrated/happy/neutral, colored by status palette). Dynamically imported.

- [ ] **Step 2: Verify and commit**
```
git add components/dashboard/AiAutomationTab.tsx
git commit -m "feat(dashboard): build AI & Automation tab with tier grid and tier override controls"
```

---

### Task 13: Build Reports Tab

**Files:**
- Create: `components/dashboard/ReportsTab.tsx`
- Create: `lib/utils/csv-export.ts`

- [ ] **Step 1: Create CSV export utility**

Client-side CSV generation. Converts array of objects to CSV string, triggers browser download. ~20 lines.

- [ ] **Step 2: Build the Reports component**

Fetches from `?tab=reporting` + `?tab=trends` on mount.

Sections:
1. Date range picker (period buttons) + CSV export button (top-right)
2. Weekly rollup table — `DataTable` with columns: Week, Tickets, Avg Resolution, P90, Spam%, AI Accuracy
3. Monthly summary — 3 `MetricCard`s side by side (one per month)
4. Daily volume table — last 14 days from trends data

- [ ] **Step 3: Verify and commit**
```
git add lib/utils/csv-export.ts components/dashboard/ReportsTab.tsx
git commit -m "feat(dashboard): build Reports tab with CSV export and date range picker"
```

---

### Task 14: Rewrite page.tsx (Wire Everything Together)

**Files:**
- Modify: `app/page.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite page.tsx**

Key patterns:

1. **Dynamic imports** for all 4 tab components:
```tsx
const CommandCenterTab = dynamic(() => import('@/components/dashboard/CommandCenterTab'), {
  loading: () => <TabSkeleton />,
});
```

2. **DashboardHeader** always visible (uses summary data)

3. **Lazy loading per tab:**
   - Command Center: fetches `/api/dashboard/summary` on mount (it's the default tab)
   - Team: fetches `/api/dashboard/team` on first activation
   - AI: fetches `/api/dashboard/ai` on first activation
   - Reports: fetches `?tab=reporting` + `?tab=trends` on first activation
   - Each fetch caches in state — subsequent tab switches show cached data

4. **Typed fetch wrappers** — no `as unknown as` casts:
```tsx
async function fetchSummary(): Promise<DashboardSummary> {
  const res = await fetch('/api/dashboard/summary');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

5. **URL param persistence** for active tab (keep existing pattern)

6. **TabSkeleton** shown during initial load and first-time tab activation

7. **Error state per tab** — amber banner with retry button (keep existing pattern)

- [ ] **Step 2: Remove old components**

Delete the 16 replaced component files listed in "Removed After Migration".

- [ ] **Step 3: Verify full build**

Run: `npx tsc --noEmit && npx jest --passWithNoTests`
Expected: Clean compile, 48/48 tests pass

- [ ] **Step 4: Commit**
```
git add app/page.tsx
git rm components/dashboard/PulseHeroCards.tsx components/dashboard/ResolutionChart.tsx \
  components/dashboard/RatesTrendChart.tsx components/dashboard/TopCategories.tsx \
  components/dashboard/OpsNotes.tsx components/dashboard/WorkloadChart.tsx \
  components/dashboard/TagTrendsChart.tsx components/dashboard/P90TrendChart.tsx \
  components/dashboard/OpsNotesHistory.tsx components/dashboard/TicketFlowPanel.tsx \
  components/dashboard/AgentBehaviorTab.tsx components/dashboard/AutomationControlTab.tsx \
  components/dashboard/TierReadinessTab.tsx components/dashboard/AiPerformanceTab.tsx \
  components/dashboard/FeedbackLoopTab.tsx components/dashboard/ReportingTab.tsx
git commit -m "feat(dashboard): complete 4-tab dashboard with lazy loading, dynamic imports, and design system"
```

---

## Phase 3: Slack Messages

### Task 15: Redesign Pulse Check Formatter

**Files:**
- Create: `lib/slack/formatters/pulse.ts`
- Modify: `app/api/cron/pulse-check/route.ts`
- Modify: `lib/slack/formatters.ts` (add re-export)

- [ ] **Step 1: Create new pulse formatter using Block Kit builders**

Uses: `headerBlock`, `metricLine`, `contextBlock`, `actionRow` from `lib/slack/blocks.ts`.

Output format (from spec):
- Compact header with date
- Numbers-first: open / closed / spam (using `metricLine`)
- P90 with delta from previous pulse
- Top category with count
- Unassigned count
- "View Dashboard" button (links to production URL)

The formatter accepts the same data as the current `formatPulseCheckBlocks` but produces the redesigned output.

- [ ] **Step 2: Update pulse-check cron to use new formatter**

Replace import of `formatPulseCheckBlocks` from `@/lib/slack/formatters` with import from `@/lib/slack/formatters/pulse`.

- [ ] **Step 3: Add re-export to legacy formatters.ts**

```ts
export { formatPulseCheckBlocks } from './formatters/pulse';
```

- [ ] **Step 4: Verify and commit**
```
git add lib/slack/formatters/pulse.ts lib/slack/formatters.ts app/api/cron/pulse-check/route.ts
git commit -m "feat(slack): redesign pulse check — numbers-first, delta comparisons, dashboard link"
```

---

### Task 16: Redesign Escalation Alert Formatter

**Files:**
- Create: `lib/slack/formatters/escalation.ts`
- Modify: `app/api/cron/escalation-scan/route.ts`
- Modify: `lib/slack/formatters.ts` (add re-export)

- [ ] **Step 1: Create new escalation formatter using Block Kit builders**

Uses: `headerBlock`, `ticketBlock`, `actionRow` from `lib/slack/blocks.ts`.

Output format: ticket-first layout, SLA context inline (target vs actual), Reply + Assign buttons on unassigned tickets. "Assign to Me" button that uses the Slack user ID from the interactivity context (the handler already receives `user.id`).

- [ ] **Step 2: Update escalation scan to use new formatter**

- [ ] **Step 3: Add re-export to legacy formatters.ts**

- [ ] **Step 4: Verify and commit**
```
git add lib/slack/formatters/escalation.ts lib/slack/formatters.ts app/api/cron/escalation-scan/route.ts
git commit -m "feat(slack): redesign escalation alerts — ticket-first with SLA context and Assign to Me"
```

---

### Task 17: Extract and Redesign Daily Standup Formatter

**Files:**
- Create: `lib/slack/formatters/standup.ts`
- Modify: `app/api/cron/daily-standup/route.ts`

- [ ] **Step 1: Extract block construction into formatter**

Move the inline Block Kit construction from `daily-standup/route.ts` into `formatDailyStandupBlocks()`. The route handler should call the formatter and send the result.

- [ ] **Step 2: Redesign per spec**

Uses: `headerBlock`, `ticketBlock`, `metricLine`, `contextBlock` from `lib/slack/blocks.ts`.

Morning Brief format: day name + date in header, overnight stats as `metricLine`, "Right now" summary, stale tickets with Reply buttons via `ticketBlock`, SLA breaches section, conversational closer ("Everything else looks good. Have a productive day." — only when no critical issues).

- [ ] **Step 3: Update route to use formatter**

- [ ] **Step 4: Verify and commit**
```
git add lib/slack/formatters/standup.ts app/api/cron/daily-standup/route.ts
git commit -m "feat(slack): extract and redesign daily standup — conversational morning brief"
```

---

### Task 18: Create New Ticket Triage Card

**Files:**
- Create: `lib/slack/formatters/triage-card.ts`
- Modify: `lib/slack/handlers/auto-triage.ts`

- [ ] **Step 1: Create triage card formatter**

Uses: `headerBlock`, `ticketBlock`, `actionRow` from `lib/slack/blocks.ts`.

Compact card for individual new tickets (distinct from `formatTriageChainBlocks` which is bulk triage queue). Shows: ticket ID + category in header, customer message preview (first 150 chars), sentiment indicator, priority, auto-assignment, SLA target.

Buttons: Reply, Reassign, Wrong Category (reuses existing `open_reply_modal`, `show_category_triage` action IDs).

- [ ] **Step 2: Wire into auto-triage handler**

After auto-triage classifies and assigns a ticket, post the new triage card to the ops channel.

- [ ] **Step 3: Verify tests still pass**

Run: `npx jest --passWithNoTests`
Expected: 48/48 pass (auto-triage tests mock Slack calls)

- [ ] **Step 4: Commit**
```
git add lib/slack/formatters/triage-card.ts lib/slack/handlers/auto-triage.ts
git commit -m "feat(slack): add individual triage card with contextual action buttons"
```

---

## Phase 4: Polish

### Task 19: Loading Skeletons + Transitions

**Files:**
- Modify: `app/page.tsx` (skeleton states)
- Modify: `components/ui/metric-card.tsx` (skeleton variant)
- Modify: `components/ui/chart-card.tsx` (skeleton variant)

- [ ] **Step 1: Add skeleton variants to MetricCard and ChartCard**

MetricCard skeleton: pulsing gray rectangle (h-28, rounded-xl, animate-pulse).
ChartCard skeleton: pulsing gray block with title placeholder (h-64, rounded-xl).

- [ ] **Step 2: Add hover/focus transitions**

Ensure all interactive elements have:
- Cards: `hover:shadow-md transition-shadow duration-150`
- Buttons: `focus-visible:ring-2 focus-visible:ring-ironside-gold focus-visible:ring-offset-2`
- Table rows: `hover:bg-slate-50 transition-colors duration-150`

- [ ] **Step 3: Verify and commit**
```
git add app/page.tsx components/ui/
git commit -m "feat(polish): loading skeletons, hover states, focus rings"
```

---

### Task 20: Mobile Responsive Breakpoints

**Files:**
- Modify: `components/dashboard/CommandCenterTab.tsx`
- Modify: `components/dashboard/TeamTab.tsx`
- Modify: `components/dashboard/AiAutomationTab.tsx`
- Modify: `components/ui/dashboard-header.tsx`

- [ ] **Step 1: Add responsive breakpoints**

- MetricCards: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`
- Chart grid: `grid-cols-1 md:grid-cols-2`
- DashboardHeader: flex-col on mobile, flex-row on desktop
- Tables: `overflow-x-auto` wrapper on all tables
- Leaderboard: hide CSAT + Closes columns on mobile (`hidden md:table-cell`)
- Tabs: already has `overflow-x-auto`

- [ ] **Step 2: Test at 3 viewports**

Check 375px (mobile), 768px (tablet), 1024px (desktop) using browser dev tools.

- [ ] **Step 3: Commit**
```
git add components/
git commit -m "feat(polish): responsive breakpoints for mobile and tablet"
```

---

### Task 21: Final Cleanup + Print Styles

- [ ] **Step 1: Add `no-print` class to DashboardHeader and Tabs**

The dark header prints badly. Add `className="no-print"` to DashboardHeader wrapper and Tabs container. The `@media print` rule in globals.css hides these.

- [ ] **Step 2: Run full test suite**

Run: `npx jest --passWithNoTests`
Expected: 48/48 pass

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Remove any unused imports across all modified files**

- [ ] **Step 5: Final commit**
```
git add -A
git commit -m "chore: final cleanup — print styles, unused imports, verify all tests pass"
```

---

## Verification Checklist

After all phases are complete:

- [ ] Dashboard loads Command Center in <2 seconds (single `/api/dashboard/summary` fetch)
- [ ] 4 tabs work: Command Center, Team, AI & Automation, Reports
- [ ] Non-active tabs lazy-load on first click (no upfront fetch)
- [ ] Dynamic imports — tab components code-split, charts load on demand
- [ ] Gold accent visible on active tab underline — NOT used as body text
- [ ] Dark branded header with absolute timestamp ("Data from 2:00 PM")
- [ ] AlertBanner shows when SLA breaches or volume spikes exist
- [ ] MetricCards fit above the fold on 1080p without scrolling
- [ ] Tier override controls work in AI & Automation tab (POST to /api/automation)
- [ ] Heat-colored response times have arrow icons (colorblind accessible)
- [ ] All Slack messages use shared Block Kit builders (no duplicate JSON construction)
- [ ] Pulse check message: numbers-first, delta, single dashboard link
- [ ] Escalation alert: ticket-first, SLA context, Assign to Me button
- [ ] Standup: conversational, surfaces problems only, friendly closer
- [ ] AI agent responses: concise, context-aware, answer-first, no "I"
- [ ] CSV export works on Reports tab
- [ ] 48/48 tests pass
- [ ] Mobile responsive at 375px, 768px, 1024px
- [ ] Print view hides header and tabs, forces white backgrounds
- [ ] No `as unknown as` casts in page.tsx
- [ ] Old components deleted (16 files)
- [ ] Legacy formatters.ts re-exports moved functions
