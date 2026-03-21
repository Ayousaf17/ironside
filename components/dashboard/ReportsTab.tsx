'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { MetricCard } from '@/components/ui/metric-card';
import { EmptyState } from '@/components/ui/empty-state';
import { downloadCsv } from '@/lib/utils/csv-export';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  tab: string;
  weeklyRollups: WeeklyRollup[];
  monthlySummary: MonthlySummary[];
  aiCosts: { totalRequests: number; totalTokens: number; totalCostUsd: number };
}

interface DailyVolume {
  date: string;
  tickets: number;
  open: number;
  closed: number;
  spamPct: number;
  unassignedPct: number;
  p50Min: number;
  p90Min: number;
}

interface TrendsData {
  tab: string;
  dailyVolume: DailyVolume[];
}

type Period = '7d' | '30d' | '90d' | 'all';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Skeleton ────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-48" />
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded w-full" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="h-4 bg-slate-100 rounded w-24 mb-2" />
            <div className="h-8 bg-slate-100 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-100 rounded w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ReportsTab() {
  const [reportingData, setReportingData] = useState<ReportingData | null>(null);
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30d');

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [reportingRes, trendsRes] = await Promise.all([
          fetch('/api/dashboard?tab=reporting'),
          fetch('/api/dashboard?tab=trends'),
        ]);

        if (!reportingRes.ok || !trendsRes.ok) {
          throw new Error('Failed to fetch report data');
        }

        const [reporting, trends] = await Promise.all([
          reportingRes.json() as Promise<ReportingData>,
          trendsRes.json() as Promise<TrendsData>,
        ]);

        if (!cancelled) {
          setReportingData(reporting);
          setTrendsData(trends);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <EmptyState
        title="Failed to load reports"
        description={error}
        action={
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!reportingData || reportingData.weeklyRollups.length === 0) {
    return (
      <EmptyState
        title="No Report Data Yet"
        description="Reports populate after pulse checks and agent activity start flowing."
      />
    );
  }

  const filteredRollups = filterByPeriod(reportingData.weeklyRollups, period);
  const dailyVolume = (trendsData?.dailyVolume ?? []).slice(-14);

  const periods: { label: string; value: Period }[] = [
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: 'All', value: 'all' },
  ];

  function handleExportCsv() {
    const rows = filteredRollups.map(w => ({
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
      {/* ── 1. Header Row ─────────────────────────────────────────────────── */}
      <SectionHeader
        title="Reports"
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {periods.map(p => (
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

      {/* ── 2. Weekly Rollup Table ────────────────────────────────────────── */}
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

      {/* ── 3. Monthly Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {reportingData.monthlySummary.map(m => (
          <MetricCard
            key={m.month}
            label={m.month}
            value={m.totalTickets.toLocaleString()}
            unit="tickets"
            className=""
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-2">
        {reportingData.monthlySummary.map(m => (
          <p key={m.month} className="text-xs text-slate-500 text-center">
            {m.avgResolutionMin != null ? `${m.avgResolutionMin} min avg resolution` : 'No resolution data'}
            {' \u00B7 '}
            {m.totalAgentActions} agent actions
          </p>
        ))}
      </div>

      {/* ── 4. Daily Volume Table ─────────────────────────────────────────── */}
      {dailyVolume.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">
              Daily Volume (Last 14 Days)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Tickets</th>
                  <th className="px-6 py-3 text-right">Open</th>
                  <th className="px-6 py-3 text-right">Closed</th>
                  <th className="px-6 py-3 text-right">Spam%</th>
                  <th className="px-6 py-3 text-right">P90</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyVolume.map((d, i) => (
                  <tr
                    key={d.date}
                    className={i % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}
                  >
                    <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {d.date}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="metric tabular-nums text-slate-700">
                        {d.tickets}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="metric tabular-nums text-slate-700">
                        {d.open}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="metric tabular-nums text-slate-700">
                        {d.closed}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="metric tabular-nums text-slate-700">
                        {d.spamPct}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="metric tabular-nums text-slate-700">
                        {d.p90Min} min
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
