'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { DollarSign, Calculator, Zap, TrendingUp, TrendingDown, Download } from 'lucide-react';

import { MetricCard } from '@/components/ui/metric-card';
import { SectionHeader } from '@/components/ui/section-header';
import { ChartCard } from '@/components/ui/chart-card';
import { StatusDot } from '@/components/ui/status-dot';
import { EmptyState } from '@/components/ui/empty-state';
import { downloadCsv } from '@/lib/utils/csv-export';

const AreaChart = dynamic(
  () => import('@tremor/react').then((mod) => mod.AreaChart),
  { ssr: false },
);

const BarList = dynamic(
  () => import('@tremor/react').then((mod) => mod.BarList),
  { ssr: false },
);

const BarChart = dynamic(
  () => import('@tremor/react').then((mod) => mod.BarChart),
  { ssr: false },
);

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface CostKpis {
  totalCost30d: number;
  costDelta: number | null;
  costPerTicket: number | null;
  totalTokens: number;
}

interface CostBreakdownItem {
  category: string;
  totalCost: number;
  requestCount: number;
}

interface CostTrendPoint {
  date: string;
  costUsd: number;
  tokens: number;
}

interface TokenByIntentItem {
  intent: string;
  count: number;
  totalTokens: number;
}

interface PeakUsageItem {
  hour: number;
  tokens: number;
  costUsd: number;
}

interface CronHealthItem {
  name: string;
  lastRun: string | null;
  success: boolean;
}

interface WebhookHealth {
  eventsToday: number;
  errorsToday: number;
  errorRate: number;
}

interface SlowEndpoint {
  endpoint: string;
  avgMs: number;
}

interface ApiHealth {
  avgDurationMs: number | null;
  errorRate: number;
  totalRequests: number;
  slowEndpoints: SlowEndpoint[];
}

interface WeeklyRollup {
  week: string;
  totalTickets: number;
  avgResolutionMin: number | null;
  p90Min: number | null;
  spamPct: number | null;
  agentActions: number;
  agentBreakdown: { agent: string; actions: number }[];
  aiAccuracy: number | null;
  aiJudged: number;
}

interface MonthlySummary {
  month: string;
  totalTickets: number;
  avgResolutionMin: number | null;
  totalAgentActions: number;
  pulseChecks: number;
}

interface ReportingData {
  weeklyRollups: WeeklyRollup[];
  monthlySummary: MonthlySummary[];
  aiCosts: { totalRequests: number; totalTokens: number; totalCostUsd: number };
}

export interface CostDataResponse {
  kpis: CostKpis;
  costBreakdown: CostBreakdownItem[];
  costTrend: CostTrendPoint[];
  tokenByIntent: TokenByIntentItem[];
  peakUsage: PeakUsageItem[];
  cronHealth: CronHealthItem[];
  webhookHealth: WebhookHealth;
  apiHealth: ApiHealth;
  reporting?: ReportingData;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

type Period = '7d' | '30d' | '90d' | 'all';

function filterByPeriod(rollups: WeeklyRollup[], period: Period): WeeklyRollup[] {
  switch (period) {
    case '7d':
      return rollups.slice(-1);
    case '30d':
      return rollups.slice(-4);
    case '90d':
      return rollups.slice(-13);
    case 'all':
    default:
      return rollups;
  }
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function CostDataTab({ data }: { data: CostDataResponse }) {
  const [period, setPeriod] = useState<Period>('30d');

  if (!data || !data.kpis) {
    return (
      <EmptyState
        title="No Cost Data"
        description="Cost and data flow information will appear once token usage is tracked."
      />
    );
  }

  const { kpis, costBreakdown, costTrend, tokenByIntent, peakUsage, cronHealth, webhookHealth, apiHealth, reporting } = data;

  const costDeltaIcon = kpis.costDelta !== null && kpis.costDelta >= 0 ? TrendingUp : TrendingDown;

  // BarList data for cost breakdown
  const breakdownBarData = costBreakdown.map((item) => ({
    name: item.category,
    value: item.totalCost,
  }));

  // BarList data for token by intent
  const intentBarData = tokenByIntent.map((item) => ({
    name: item.intent,
    value: item.totalTokens,
  }));

  // Peak usage bar chart data
  const peakChartData = peakUsage.map((item) => ({
    hour: formatHour(item.hour),
    Tokens: item.tokens,
  }));

  // Reporting
  const filteredRollups = reporting
    ? filterByPeriod(reporting.weeklyRollups, period)
    : [];

  const periods: { label: string; value: Period }[] = [
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: 'All', value: 'all' },
  ];

  function handleExportCsv() {
    const rows = filteredRollups.map((w) => ({
      Week: w.week,
      Tickets: w.totalTickets,
      'Avg Resolution (min)': w.avgResolutionMin ?? '',
      'P90 (min)': w.p90Min ?? '',
      'Spam %': w.spamPct ?? '',
      'Agent Actions': w.agentActions,
      'AI Accuracy': w.aiAccuracy != null ? `${w.aiAccuracy}%` : '',
    }));
    downloadCsv(
      rows as unknown as Record<string, unknown>[],
      `ironside-report-${new Date().toISOString().split('T')[0]}.csv`,
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. KPI Cards ──────────────────────────────────────────────── */}
      <SectionHeader title="Token Economics" subtitle="30-day cost and usage overview" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Cost (30d)"
          value={`$${kpis.totalCost30d.toFixed(2)}`}
          icon={DollarSign}
          delta={kpis.costDelta ?? undefined}
          deltaInverted
        />
        <MetricCard
          label="Cost / Ticket"
          value={kpis.costPerTicket != null ? `$${kpis.costPerTicket.toFixed(2)}` : '--'}
          icon={Calculator}
        />
        <MetricCard
          label="Total Tokens"
          value={kpis.totalTokens.toLocaleString()}
          icon={Zap}
        />
        <MetricCard
          label="Cost Trend"
          value={kpis.costDelta != null ? `${kpis.costDelta > 0 ? '+' : ''}${kpis.costDelta}%` : '--'}
          icon={costDeltaIcon}
        />
      </div>

      {/* ── 2. Cost Breakdown ─────────────────────────────────────────── */}
      {costBreakdown.length > 0 && (
        <ChartCard title="Cost Breakdown" subtitle="By source and model (30d)">
          <BarList
            data={breakdownBarData}
            valueFormatter={(v: number) => `$${v.toFixed(3)}`}
            className="mt-2"
          />
        </ChartCard>
      )}

      {/* ── 3. Cost Trend ─────────────────────────────────────────────── */}
      {costTrend.length > 0 && (
        <ChartCard title="Daily Cost Trend" subtitle="Token spend over 30 days">
          <AreaChart
            data={costTrend}
            index="date"
            categories={['costUsd']}
            colors={['blue']}
            valueFormatter={(v: number) => `$${v.toFixed(3)}`}
            showAnimation
            className="h-64"
          />
        </ChartCard>
      )}

      {/* ── 4. Token by Intent ────────────────────────────────────────── */}
      {tokenByIntent.length > 0 && (
        <ChartCard title="Tokens by Intent" subtitle="Token consumption grouped by API intent (30d)">
          <BarList
            data={intentBarData}
            valueFormatter={(v: number) => v.toLocaleString()}
            className="mt-2"
          />
        </ChartCard>
      )}

      {/* ── 5. Peak Usage ─────────────────────────────────────────────── */}
      {peakUsage.some((p) => p.tokens > 0) && (
        <ChartCard title="Peak Usage by Hour" subtitle="Token consumption by hour of day (30d)">
          <BarChart
            data={peakChartData}
            index="hour"
            categories={['Tokens']}
            colors={['indigo']}
            valueFormatter={(v: number) => v.toLocaleString()}
            showAnimation
            className="h-64"
          />
        </ChartCard>
      )}

      {/* ── 6. Data Flow Health ───────────────────────────────────────── */}
      <SectionHeader title="System Health" subtitle="Cron jobs, webhooks, and API status" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Cron Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Cron Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Last Run</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cronHealth.map((cron) => (
                  <tr key={cron.name} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {cron.name}
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {cron.lastRun ? relativeTime(cron.lastRun) : 'Never'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={cron.success ? 'good' : cron.lastRun ? 'bad' : 'neutral'} />
                        <span className="text-xs text-slate-600">
                          {cron.success ? 'OK' : cron.lastRun ? 'Error' : 'No data'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Webhook + API Health */}
        <div className="space-y-4">
          {/* Webhook Health */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Webhook Health</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Events Today</span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {webhookHealth.eventsToday}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Errors</span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {webhookHealth.errorsToday}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Error Rate</span>
                <span className={`text-sm font-medium tabular-nums ${webhookHealth.errorRate > 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {webhookHealth.errorRate}%
                </span>
              </div>
            </div>
          </div>

          {/* API Health */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">API Health (24h)</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Avg Response</span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {apiHealth.avgDurationMs != null ? `${apiHealth.avgDurationMs}ms` : '--'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Error Rate</span>
                <span className={`text-sm font-medium tabular-nums ${apiHealth.errorRate > 5 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {apiHealth.errorRate}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Total Requests</span>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {apiHealth.totalRequests}
                </span>
              </div>
            </div>

            {apiHealth.slowEndpoints.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Slowest Endpoints</p>
                <div className="space-y-1.5">
                  {apiHealth.slowEndpoints.map((ep) => (
                    <div key={ep.endpoint} className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 truncate max-w-[160px]" title={ep.endpoint}>
                        {ep.endpoint}
                      </span>
                      <span className="text-xs font-medium text-slate-900 tabular-nums">
                        {ep.avgMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 7. Historical Reports ─────────────────────────────────────── */}
      {reporting && reporting.weeklyRollups.length > 0 && (
        <>
          <SectionHeader
            title="Historical Reports"
            action={
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {periods.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        period === p.value
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </div>
            }
          />

          {/* Weekly Rollup Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Weekly Rollups</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Week</th>
                    <th className="px-6 py-3 text-right">Tickets</th>
                    <th className="px-6 py-3 text-right">Avg Resolution (min)</th>
                    <th className="px-6 py-3 text-right">P90 (min)</th>
                    <th className="px-6 py-3 text-right">Spam%</th>
                    <th className="px-6 py-3 text-right">Agent Actions</th>
                    <th className="px-6 py-3 text-right">AI Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRollups.map((w, i) => (
                    <tr
                      key={w.week}
                      className={i % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}
                    >
                      <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {w.week}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="metric tabular-nums text-slate-700">
                          {w.totalTickets || '\u2013'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="metric tabular-nums text-slate-700">
                          {w.avgResolutionMin != null ? w.avgResolutionMin : '\u2013'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="metric tabular-nums text-slate-700">
                          {w.p90Min != null ? w.p90Min : '\u2013'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="metric tabular-nums text-slate-700">
                          {w.spamPct != null ? `${w.spamPct}%` : '\u2013'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="metric tabular-nums text-slate-700">
                          {w.agentActions || '\u2013'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        {w.aiAccuracy != null ? (
                          <span
                            className={`metric tabular-nums font-medium ${
                              w.aiAccuracy >= 80
                                ? 'text-emerald-700'
                                : w.aiAccuracy >= 60
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {w.aiAccuracy}%
                          </span>
                        ) : (
                          <span className="text-slate-400">{'\u2013'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Summary */}
          {reporting.monthlySummary.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {reporting.monthlySummary.map((m) => (
                  <MetricCard
                    key={m.month}
                    label={m.month}
                    value={m.totalTickets.toLocaleString()}
                    unit="tickets"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-2">
                {reporting.monthlySummary.map((m) => (
                  <p key={m.month} className="text-xs text-slate-500 text-center">
                    {m.avgResolutionMin != null
                      ? `${m.avgResolutionMin} min avg resolution`
                      : 'No resolution data'}
                    {' \u00B7 '}
                    {m.totalAgentActions} agent actions
                  </p>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
