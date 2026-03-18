'use client';

import { formatCurrency } from '@/lib/utils';

export interface AiAnalytics {
  today: { requests: number; totalTokens: number; costUsd: number };
  month: { requests: number; totalTokens: number; costUsd: number };
  sessions: { total: number; avgDurationMs: number | null };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'gray';
}

function StatCard({ label, value, sub, accent = 'gray' }: StatCardProps) {
  const accentBar = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-400',
  }[accent];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className={`w-8 h-1 rounded-full mb-3 ${accentBar}`} />
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AiPerformanceTab({ data }: { data: AiAnalytics | null }) {
  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No AI Usage Data Yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Token usage is logged automatically when the AI workflows run. Data will appear here
          once the pulse check cron or Slack AI calls have fired.
        </p>
      </div>
    );
  }

  const { today, month, sessions } = data;
  const noData = month.requests === 0 && sessions.total === 0;

  if (noData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No AI Usage Data Yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Token usage is logged automatically when the AI workflows run. Data will appear here
          once the pulse check cron or Slack AI calls have fired.
        </p>
      </div>
    );
  }

  const costPerRequest = month.requests > 0
    ? month.costUsd / month.requests
    : null;

  return (
    <div className="space-y-6">
      {/* Today */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Today</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            label="AI requests"
            value={today.requests.toLocaleString()}
            accent="blue"
          />
          <StatCard
            label="Tokens used"
            value={formatTokens(today.totalTokens)}
            accent="blue"
          />
          <StatCard
            label="Cost"
            value={formatCurrency(today.costUsd)}
            accent="blue"
          />
        </div>
      </div>

      {/* This month */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">This Month</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            label="AI requests"
            value={month.requests.toLocaleString()}
            accent="emerald"
          />
          <StatCard
            label="Tokens used"
            value={formatTokens(month.totalTokens)}
            accent="emerald"
          />
          <StatCard
            label="Cost"
            value={formatCurrency(month.costUsd)}
            sub={costPerRequest ? `${formatCurrency(costPerRequest)} / request` : undefined}
            accent="emerald"
          />
        </div>
      </div>

      {/* Sessions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agent Sessions</h2>
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Total sessions"
            value={sessions.total.toLocaleString()}
            accent="amber"
          />
          <StatCard
            label="Avg duration"
            value={formatDuration(sessions.avgDurationMs)}
            sub="per session"
            accent="amber"
          />
        </div>
      </div>

      {/* Rate note */}
      <p className="text-xs text-gray-400 text-right">
        Token costs reflect what was logged at time of request. Actual billing may vary by provider.
      </p>
    </div>
  );
}
