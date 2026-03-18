'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PulseCheck } from '@/types/pulse';

interface PulseHeroCardsProps {
  latest: PulseCheck | null;
  previous: PulseCheck | null;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

function formatDelta(current: number, previous: number | undefined, decimals: number = 1): string {
  if (previous === undefined || previous === null) return '';
  const diff = current - previous;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(decimals)}`;
}

interface MetricCardProps {
  label: string;
  value: string;
  delta: string;
  /** Whether an increase in this metric is "good" (true) or "bad" (false) */
  increaseIsGood: boolean;
  isBad: boolean;
  trendLabel?: string;
}

function MetricCard({ label, value, delta, increaseIsGood, isBad, trendLabel }: MetricCardProps) {
  const numericDelta = parseFloat(delta);
  const isPositive = numericDelta > 0;
  const isNegative = numericDelta < 0;
  const isNeutral = delta === '' || numericDelta === 0;

  // Determine if the change is favorable
  let changeIsFavorable = false;
  if (isPositive && increaseIsGood) changeIsFavorable = true;
  if (isNegative && !increaseIsGood) changeIsFavorable = true;

  const arrowColor = isNeutral
    ? 'text-gray-400'
    : changeIsFavorable
    ? 'text-green-600'
    : 'text-red-500';

  const bgClass = isBad
    ? 'bg-red-50 border-red-200'
    : 'bg-white border-gray-200';

  return (
    <div className={`p-6 rounded-xl border shadow-sm ${bgClass}`}>
      <h3 className="text-sm font-medium text-gray-500">{label}</h3>
      <div className="mt-2 flex items-end gap-3">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {delta !== '' && (
          <div className="flex flex-col">
            <span className={`flex items-center gap-1 text-sm font-medium ${arrowColor}`}>
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : isNegative ? (
                <TrendingDown className="h-4 w-4" />
              ) : null}
              {delta}
            </span>
            {trendLabel && (
              <span className="text-[10px] text-gray-400 font-normal">{trendLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TrueQueueCardProps {
  trueUnassigned: number;
  delta: string;
  subtitle: string;
  isBad: boolean;
  trendLabel?: string;
}

function TrueQueueCard({ trueUnassigned, delta, subtitle, isBad, trendLabel }: TrueQueueCardProps) {
  const numericDelta = parseFloat(delta);
  const isPositive = numericDelta > 0;
  const isNegative = numericDelta < 0;
  const isNeutral = delta === '' || numericDelta === 0;
  // For queue depth: decrease is good (fewer unassigned tickets)
  const changeIsFavorable = isNegative;

  const arrowColor = isNeutral
    ? 'text-gray-400'
    : changeIsFavorable
    ? 'text-green-600'
    : 'text-red-500';

  const bgClass = isBad ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200';

  return (
    <div className={`p-6 rounded-xl border shadow-sm ${bgClass}`}>
      <h3 className="text-sm font-medium text-gray-500">True Queue Depth</h3>
      <div className="mt-2 flex items-end gap-3">
        <span className="text-2xl font-bold text-gray-900">{trueUnassigned}</span>
        {delta !== '' && (
          <div className="flex flex-col">
            <span className={`flex items-center gap-1 text-sm font-medium ${arrowColor}`}>
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : isNegative ? (
                <TrendingDown className="h-4 w-4" />
              ) : null}
              {delta}
            </span>
            {trendLabel && (
              <span className="text-[10px] text-gray-400 font-normal">{trendLabel}</span>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-400 leading-snug">{subtitle}</p>
    </div>
  );
}

export default function PulseHeroCards({ latest, previous }: PulseHeroCardsProps) {
  if (!latest) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-pulse">
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // True Queue Depth — excludes spam that's auto-closing from "unassigned"
  const rawUnassigned = latest.workload['Unassigned'] ?? 0;
  const autoCloseCount = latest.tags['auto-close'] ?? 0;
  const trueUnassigned = Math.max(0, rawUnassigned - autoCloseCount);

  const prevRawUnassigned = previous?.workload['Unassigned'] ?? 0;
  const prevAutoCloseCount = previous?.tags['auto-close'] ?? 0;
  const prevTrueUnassigned = previous ? Math.max(0, prevRawUnassigned - prevAutoCloseCount) : undefined;

  const trueQueueDelta = formatDelta(trueUnassigned, prevTrueUnassigned, 0);
  const trueQueueSubtitle =
    autoCloseCount > 0
      ? `${rawUnassigned} flagged unassigned — ${autoCloseCount} are just spam taking a nap`
      : `${rawUnassigned} total unassigned`;

  const spamDelta = formatDelta(latest.spam_pct, previous?.spam_pct);
  const resDelta = formatDelta(latest.resolution_avg_min, previous?.resolution_avg_min, 0);
  const openDelta = formatDelta(latest.open_count, previous?.open_count, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Card 1: True Queue Depth (replaces raw Unassigned %) */}
      <TrueQueueCard
        trueUnassigned={trueUnassigned}
        delta={trueQueueDelta}
        subtitle={trueQueueSubtitle}
        isBad={trueUnassigned > 15}
        trendLabel={previous ? 'WoW' : undefined}
      />
      <MetricCard
        label="Spam Rate"
        value={`${latest.spam_pct.toFixed(1)}%`}
        delta={spamDelta}
        increaseIsGood={false}
        isBad={latest.spam_pct > 25}
        trendLabel={previous ? 'WoW' : undefined}
      />
      <MetricCard
        label="Avg Resolution"
        value={formatMinutes(latest.resolution_avg_min)}
        delta={resDelta ? `${resDelta}m` : ''}
        increaseIsGood={false}
        isBad={false}
        trendLabel={previous ? 'WoW' : undefined}
      />
      <MetricCard
        label="Open Tickets"
        value={latest.open_count.toString()}
        delta={openDelta}
        increaseIsGood={false}
        isBad={false}
        trendLabel={previous ? 'WoW' : undefined}
      />
    </div>
  );
}
