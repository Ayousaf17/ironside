'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Shield, Lock, Unlock, ArrowRight, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

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

interface ProjectionItem {
  category: string;
  weeklyTickets: number;
  avgHandlingMin: number | null;
  weeklyAgentHours: number | null;
  monthlySavingsUsd: number | null;
  primaryAgent: string | null;
  totalTickets30d: number;
}

interface BlockerItem {
  category: string;
  tier: string;
  blockers: string[];
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
  projections?: ProjectionItem[];
  blockers?: BlockerItem[];
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
  projection,
  blocker,
}: {
  item: TierItem;
  costSavings?: number;
  projection?: ProjectionItem;
  blocker?: BlockerItem;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isT3Ready = item.tier === 'T3';
  const isT2 = item.tier === 'T2';
  const nextTier = isT3Ready ? null : isT2 ? 'T3' : item.tier === 'T1' ? 'T2' : 'T1';

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
          reason: 'Manual override from T3 Control Panel',
        }),
      });
    } finally {
      setSaving(false);
      setOverrideOpen(false);
    }
  }

  // Border color by tier
  const borderColor = isT3Ready
    ? 'border-l-4 border-l-emerald-400'
    : isT2
      ? 'border-l-4 border-l-blue-400'
      : item.tier === 'T1'
        ? 'border-l-4 border-l-amber-400'
        : 'border-l-4 border-l-slate-300';

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${borderColor}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="font-semibold text-sm text-slate-900">
          {item.category}
        </span>
        <StatusBadge variant={tierVariant(item.tier)}>
          {tierLabel(item.tier)}
        </StatusBadge>
      </div>

      {/* Accuracy ring + stats */}
      <div className="flex items-center gap-3 mb-3">
        <ScoreRing
          value={item.accuracy}
          size={56}
          color={tierRingColor(item.tier)}
          label={`${item.accuracy}%`}
        />
        <div>
          <p className="text-xs text-slate-500">
            {item.ticketCount} judged &middot; {item.avgConfidence}% confidence
          </p>
          {costSavings != null && costSavings > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">
              ${costSavings.toFixed(2)} saved so far
            </p>
          )}
        </div>
      </div>

      {/* Before/After Projection */}
      {projection && projection.avgHandlingMin != null && (
        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <p className="text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            If AI handles this autonomously:
          </p>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Current: {projection.primaryAgent ?? 'team'} handles {projection.weeklyTickets} tickets/week</span>
            </div>
            <div className="flex justify-between">
              <span>Avg handling time</span>
              <span className="font-mono">{projection.avgHandlingMin}min/ticket</span>
            </div>
            {projection.weeklyAgentHours != null && (
              <div className="flex justify-between font-medium text-emerald-700">
                <span>Weekly time saved</span>
                <span className="font-mono">{projection.weeklyAgentHours}h/week</span>
              </div>
            )}
            {projection.monthlySavingsUsd != null && (
              <div className="flex justify-between font-medium text-emerald-700">
                <span>Monthly savings</span>
                <span className="font-mono">${projection.monthlySavingsUsd}/mo</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blockers */}
      {blocker && blocker.blockers.length > 0 && !isT3Ready && (
        <div className="mb-3 space-y-1">
          {blocker.blockers.map((msg, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* T3 Activation Button */}
      {isT3Ready ? (
        <button
          type="button"
          onClick={() => handleOverride('T3')}
          disabled={saving}
          className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-ironside-gold/10 border border-ironside-gold/30 text-ironside-gold font-medium text-xs hover:bg-ironside-gold/20 transition-colors"
        >
          <Unlock className="h-3.5 w-3.5" />
          Enable Autonomous Mode
        </button>
      ) : blocker && blocker.blockers[0] === 'Ready for autonomous mode' ? (
        <button
          type="button"
          onClick={() => handleOverride('T3')}
          disabled={saving}
          className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-ironside-gold/10 border border-ironside-gold/30 text-ironside-gold font-medium text-xs hover:bg-ironside-gold/20 transition-colors"
        >
          <Unlock className="h-3.5 w-3.5" />
          Enable Autonomous Mode
        </button>
      ) : (
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs cursor-not-allowed"
          >
            <Lock className="h-3 w-3" />
            {nextTier ? `Locked — needs ${nextTier}` : 'Locked'}
          </button>
          {!overrideOpen ? (
            <button
              type="button"
              onClick={() => setOverrideOpen(true)}
              className="text-xs text-slate-400 hover:text-ironside-gold transition-colors"
            >
              Override
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <select
                disabled={saving}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleOverride(e.target.value as TierKey);
                }}
                className="text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-ironside-gold"
              >
                <option value="" disabled>Tier</option>
                <option value="T1">T1</option>
                <option value="T2">T2</option>
                <option value="T3">T3</option>
              </select>
              <button type="button" onClick={() => setOverrideOpen(false)} className="text-xs text-slate-400">
                ✕
              </button>
            </div>
          )}
        </div>
      )}
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
  const projections = data.projections ?? [];
  const blockers = data.blockers ?? [];

  const topMatrix = feedback.matrix.slice(0, 5);
  const recentCorrections = feedback.recentCorrections.slice(0, 10);

  // Build lookups
  const costMap = new Map<string, number>();
  for (const row of categoryCostSavings) {
    costMap.set(row.category, row.costSavingsUsd);
  }
  const projMap = new Map<string, ProjectionItem>();
  for (const p of projections) projMap.set(p.category, p);
  const blockerMap = new Map<string, BlockerItem>();
  for (const b of blockers) blockerMap.set(b.category, b);

  const totalCategories = tierSummary.t1 + tierSummary.t2 + tierSummary.t3 + tierSummary.insufficient;

  return (
    <div className="space-y-6">
      {/* ---- 1. Progress Funnel ---- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Autonomy Pipeline</h3>

        {/* Funnel visualization */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { label: 'Insufficient', count: tierSummary.insufficient, color: 'bg-slate-300', textColor: 'text-slate-700' },
            { label: 'T1 Advisory', count: tierSummary.t1, color: 'bg-amber-400', textColor: 'text-amber-900' },
            { label: 'T2 HITL', count: tierSummary.t2, color: 'bg-blue-500', textColor: 'text-white' },
            { label: 'T3 Autonomous', count: tierSummary.t3, color: 'bg-emerald-500', textColor: 'text-white' },
          ].map((stage, i) => {
            const pct = totalCategories > 0 ? Math.max((stage.count / totalCategories) * 100, stage.count > 0 ? 15 : 5) : 25;
            return (
              <div key={stage.label} className="flex items-center gap-2" style={{ flex: pct }}>
                <div className={`${stage.color} rounded-lg px-3 py-2 w-full text-center`}>
                  <div className={`text-lg font-bold ${stage.textColor}`}>{stage.count}</div>
                  <div className={`text-xs ${stage.textColor} opacity-80`}>{stage.label}</div>
                </div>
                {i < 3 && <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">
          {totalCategories} total categories tracked. {tierSummary.t3 > 0
            ? `${tierSummary.t3} ready for autonomous mode.`
            : tierSummary.t2 > 0
              ? `${tierSummary.t2} in human-in-the-loop review. Working toward T3.`
              : 'Building training data. Categories will progress as accuracy improves.'}
        </p>
      </div>

      {/* ---- 1b. Metric Cards ---- */}
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
                projection={projMap.get(item.category)}
                blocker={blockerMap.get(item.category)}
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
