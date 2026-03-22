'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Target, DollarSign, Clock, TrendingDown } from 'lucide-react';

import { MetricCard } from '@/components/ui/metric-card';
import { ScoreRing } from '@/components/ui/score-ring';
import { SectionHeader } from '@/components/ui/section-header';
import { ChartCard } from '@/components/ui/chart-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';

const AreaChart = dynamic(
  () => import('@tremor/react').then((mod) => mod.AreaChart),
  { ssr: false },
);

const BarList = dynamic(
  () => import('@tremor/react').then((mod) => mod.BarList),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiSummary {
  kpis: {
    accuracy: number | null;
    judged: number;
    costPerTicket: number | null;
    totalLlmCost: number;
    totalSavedHours: number | null;
    savedPerTicketMin: number | null;
    totalCostSavings: number;
  };
  tierReadiness: {
    category: string;
    tier: string;
    accuracy: number;
    ticketCount: number;
    avgConfidence: number;
  }[];
  feedback: {
    overallAccuracy: number | null;
    recentCorrections: {
      ticketId: number;
      aiCategory: string;
      humanCategory: string;
      correctedAt: string;
    }[];
    matrix: { aiCategory: string; humanCategory: string; count: number }[];
  };
  sentimentTrend: {
    date: string;
    angry: number;
    frustrated: number;
    happy: number;
    neutral: number;
  }[];
  costBreakdown?: {
    category: string;
    totalCost: number;
    requestCount: number;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TierKey = 'T3' | 'T2' | 'T1' | 'insufficient_data';

function tierVariant(tier: string): 'good' | 'info' | 'warn' | 'neutral' {
  switch (tier) {
    case 'T3':
      return 'good';
    case 'T2':
      return 'info';
    case 'T1':
      return 'warn';
    default:
      return 'neutral';
  }
}

function tierRingColor(tier: string): string {
  switch (tier) {
    case 'T3':
      return 'text-emerald-500';
    case 'T2':
      return 'text-blue-500';
    case 'T1':
      return 'text-amber-500';
    default:
      return 'text-slate-400';
  }
}

function tierLabel(tier: string): string {
  if (tier === 'insufficient_data') return 'Insufficient data';
  return tier;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TierCard({
  item,
}: {
  item: AiSummary['tierReadiness'][number];
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleOverride(newTier: TierKey) {
    setSaving(true);
    try {
      await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-tier',
          category: item.category,
          tier: newTier,
          reason: 'Manual override',
        }),
      });
    } finally {
      setSaving(false);
      setOverrideOpen(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="font-semibold text-sm text-slate-900">
          {item.category}
        </span>
        <StatusBadge variant={tierVariant(item.tier)}>
          {tierLabel(item.tier)}
        </StatusBadge>
      </div>

      <div className="flex items-center gap-3">
        <ScoreRing
          value={item.accuracy}
          size={56}
          color={tierRingColor(item.tier)}
          label={`${item.accuracy}%`}
        />
        <p className="text-xs text-slate-500">
          {item.ticketCount} tickets &middot; {item.avgConfidence}% confidence
        </p>
      </div>

      <div className="mt-3">
        {overrideOpen ? (
          <div className="flex items-center gap-2">
            <select
              disabled={saving}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleOverride(e.target.value as TierKey);
              }}
              className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-ironside-gold"
            >
              <option value="" disabled>
                Select tier
              </option>
              <option value="T1">T1</option>
              <option value="T2">T2</option>
              <option value="T3">T3</option>
            </select>
            <button
              type="button"
              onClick={() => setOverrideOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOverrideOpen(true)}
            className="text-xs text-slate-500 hover:text-ironside-gold transition-colors"
          >
            Override Tier
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AiAutomationTab({ data }: { data: AiSummary | null }) {
  if (!data) {
    return (
      <EmptyState
        title="No AI Data Available"
        description="AI analytics will appear here once classification and feedback data starts flowing."
      />
    );
  }

  const { kpis, tierReadiness, feedback, sentimentTrend } = data;
  const costBreakdown = data.costBreakdown ?? [];
  const topMatrix = feedback.matrix.slice(0, 5);
  const recentCorrections = feedback.recentCorrections.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* ---- KPI Cards ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="AI Accuracy"
          value={kpis.accuracy != null ? `${kpis.accuracy}%` : '\u2014'}
          icon={Target}
        />
        <MetricCard
          label="Cost / Ticket"
          value={kpis.costPerTicket != null ? `$${kpis.costPerTicket}` : '\u2014'}
          icon={DollarSign}
        />
        <MetricCard
          label="Time Saved"
          value={
            kpis.totalSavedHours != null ? `${kpis.totalSavedHours}h` : '\u2014'
          }
          icon={Clock}
        />
        <MetricCard
          label="Cost Savings"
          value={`$${kpis.totalCostSavings}`}
          icon={TrendingDown}
        />
      </div>

      {/* ---- Tier Readiness ---- */}
      <section>
        <SectionHeader title="Tier Readiness" />
        {tierReadiness.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tierReadiness.map((item) => (
              <TierCard key={item.category} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Tier Data"
            description="Tier readiness data will appear once AI classification runs accumulate."
            className="mt-4"
          />
        )}
      </section>

      {/* ---- Classification Feedback ---- */}
      <section>
        <SectionHeader title="Classification Feedback" />

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Misclassification Matrix */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Top Misclassifications
              </h3>
            </div>
            {topMatrix.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-5 py-2">AI Category</th>
                    <th className="px-5 py-2">Human Category</th>
                    <th className="px-5 py-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topMatrix.map((row) => (
                    <tr
                      key={`${row.aiCategory}-${row.humanCategory}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-5 py-2 text-xs text-slate-700">
                        {row.aiCategory}
                      </td>
                      <td className="px-5 py-2 text-xs text-slate-700">
                        {row.humanCategory}
                      </td>
                      <td className="px-5 py-2 text-xs text-right text-slate-900 font-medium">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">
                No misclassifications recorded yet.
              </p>
            )}
          </div>

          {/* Recent Corrections */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Recent Corrections
              </h3>
            </div>
            {recentCorrections.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {recentCorrections.map((c) => (
                  <li
                    key={`${c.ticketId}-${c.correctedAt}`}
                    className="px-5 py-3 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="metric text-sm font-bold text-slate-900">
                        #{c.ticketId}
                      </span>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {c.aiCategory} &rarr; {c.humanCategory}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatDate(c.correctedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">
                No corrections recorded yet.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- Cost Breakdown ---- */}
      {costBreakdown.length > 0 && (
        <section>
          <ChartCard title="Cost Breakdown" subtitle="LLM spend by source and model (30 days)">
            <BarList
              data={costBreakdown.map((c) => ({
                name: c.category,
                value: c.totalCost,
              }))}
              valueFormatter={(v: number) => `$${v.toFixed(3)}`}
            />
          </ChartCard>
        </section>
      )}

      {/* ---- Sentiment Trend ---- */}
      {sentimentTrend.length > 0 && (
        <section>
          <ChartCard title="Customer Sentiment">
            <AreaChart
              data={sentimentTrend}
              index="date"
              categories={['angry', 'frustrated', 'happy', 'neutral']}
              colors={['red', 'amber', 'emerald', 'slate']}
              stack
              className="h-72"
              showLegend
              showGridLines={false}
            />
          </ChartCard>
        </section>
      )}
    </div>
  );
}
