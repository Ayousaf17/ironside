'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Shield } from 'lucide-react';

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

interface TierItem {
  category: string;
  tier: string;
  accuracy: number;
  ticketCount: number;
  avgConfidence: number;
}

interface CorrectionItem {
  ticketId: number;
  aiCategory: string;
  humanCategory: string;
  correctedAt: string;
}

interface MatrixRow {
  aiCategory: string;
  humanCategory: string;
  count: number;
}

interface AiVsHumanRow {
  category: string;
  accuracy: number | null;
  avgAiMessages: number | null;
  avgHumanMessages: number | null;
  avgResolutionMin: number | null;
  costSavingsUsd: number;
}

interface SentimentDay {
  date: string;
  angry: number;
  frustrated: number;
  happy: number;
  neutral: number;
}

interface ConfidenceBin {
  bin: string;
  count: number;
}

export interface TierReadinessData {
  tierSummary: { t1: number; t2: number; t3: number; insufficient: number };
  tierReadiness: TierItem[];
  accuracyTrend: { week: string; category: string; accuracy: number; count: number }[];
  confidenceDistribution: ConfidenceBin[];
  aiVsHuman: AiVsHumanRow[];
  feedback: {
    matrix: MatrixRow[];
    recentCorrections: CorrectionItem[];
  };
  lastBacktest: { ranAt: string; categoriesUpdated: number } | null;
  sentimentTrend: SentimentDay[];
  categoryCostSavings: { category: string; costSavingsUsd: number }[];
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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function accuracyColor(value: number | null): string {
  if (value == null) return 'text-slate-400';
  if (value >= 98) return 'text-emerald-600';
  if (value >= 90) return 'text-blue-600';
  return 'text-amber-600';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TierCard({
  item,
  costSavings,
}: {
  item: TierItem;
  costSavings?: number;
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
        <div>
          <p className="text-xs text-slate-500">
            {item.ticketCount} tickets &middot; {item.avgConfidence}% confidence
          </p>
          {costSavings != null && costSavings > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">
              ${costSavings.toFixed(2)} saved
            </p>
          )}
        </div>
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

export default function TierReadinessTab({ data }: { data: TierReadinessData }) {
  if (!data) {
    return (
      <EmptyState
        title="No Tier Data"
        description="Tier readiness data will appear once AI classification runs accumulate."
      />
    );
  }

  const {
    tierSummary,
    tierReadiness,
    confidenceDistribution,
    aiVsHuman,
    feedback,
    lastBacktest,
    sentimentTrend,
    categoryCostSavings,
  } = data;

  const topMatrix = feedback.matrix.slice(0, 5);
  const recentCorrections = feedback.recentCorrections.slice(0, 10);

  // Build a lookup for per-category cost savings
  const costMap = new Map<string, number>();
  for (const row of categoryCostSavings) {
    costMap.set(row.category, row.costSavingsUsd);
  }

  return (
    <div className="space-y-6">
      {/* ---- 1. Tier Summary ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="T1 — Advisory"
          value={tierSummary.t1}
          icon={Shield}
          className="border-l-4 border-l-amber-400"
        />
        <MetricCard
          label="T2 — HITL"
          value={tierSummary.t2}
          icon={Shield}
          className="border-l-4 border-l-blue-400"
        />
        <MetricCard
          label="T3 — Autonomous"
          value={tierSummary.t3}
          icon={Shield}
          className="border-l-4 border-l-emerald-400"
        />
        <MetricCard
          label="Insufficient Data"
          value={tierSummary.insufficient}
          icon={Shield}
          className="border-l-4 border-l-slate-300"
        />
      </div>

      {/* ---- 2. Per-category Tier Cards ---- */}
      <section>
        <SectionHeader
          title="Per-Category Breakdown"
          subtitle="AI readiness by ticket category"
        />
        {tierReadiness.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tierReadiness.map((item) => (
              <TierCard
                key={item.category}
                item={item}
                costSavings={costMap.get(item.category)}
              />
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

      {/* ---- 3. Confidence Distribution ---- */}
      <section>
        <ChartCard
          title="Confidence Distribution"
          subtitle="AI confidence score histogram across all tickets"
        >
          {confidenceDistribution.some((b) => b.count > 0) ? (
            <BarList
              data={confidenceDistribution.map((b) => ({
                name: b.bin,
                value: b.count,
              }))}
              valueFormatter={(v: number) => `${v} tickets`}
            />
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">
              No confidence data recorded yet.
            </p>
          )}
        </ChartCard>
      </section>

      {/* ---- 4. AI vs Human Comparison Table ---- */}
      <section>
        <SectionHeader
          title="AI vs Human Comparison"
          subtitle="Performance metrics by category"
        />
        <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {aiVsHuman.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-5 py-2">Category</th>
                    <th className="px-5 py-2 text-right">AI Accuracy %</th>
                    <th className="px-5 py-2 text-right">Avg AI Msgs</th>
                    <th className="px-5 py-2 text-right">Avg Human Msgs</th>
                    <th className="px-5 py-2 text-right">Resolution (min)</th>
                    <th className="px-5 py-2 text-right">Cost Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aiVsHuman.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50">
                      <td className="px-5 py-2 text-xs font-medium text-slate-900">
                        {row.category}
                      </td>
                      <td
                        className={`px-5 py-2 text-xs text-right font-semibold ${accuracyColor(row.accuracy)}`}
                      >
                        {row.accuracy != null ? `${row.accuracy}%` : '\u2014'}
                      </td>
                      <td className="px-5 py-2 text-xs text-right text-slate-700">
                        {row.avgAiMessages ?? '\u2014'}
                      </td>
                      <td className="px-5 py-2 text-xs text-right text-slate-700">
                        {row.avgHumanMessages ?? '\u2014'}
                      </td>
                      <td className="px-5 py-2 text-xs text-right text-slate-700">
                        {row.avgResolutionMin ?? '\u2014'}
                      </td>
                      <td className="px-5 py-2 text-xs text-right text-emerald-600 font-medium">
                        {row.costSavingsUsd > 0
                          ? `$${row.costSavingsUsd.toFixed(2)}`
                          : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-400 text-center">
              No comparison data available yet.
            </p>
          )}
        </div>
      </section>

      {/* ---- 5 & 6. Confusion Matrix + Recent Corrections ---- */}
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

      {/* ---- 7. Backtest Summary ---- */}
      <section>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            Backtest Summary
          </h3>
          {lastBacktest ? (
            <p className="text-sm text-slate-600">
              Last backtest:{' '}
              <span className="font-medium text-slate-900">
                {timeAgo(lastBacktest.ranAt)}
              </span>
              , {lastBacktest.categoriesUpdated} categories updated
            </p>
          ) : (
            <p className="text-sm text-slate-400">No backtest data yet.</p>
          )}
        </div>
      </section>

      {/* ---- 8. Sentiment Trend ---- */}
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
