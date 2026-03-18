'use client';

export interface TierCategory {
  category: string;
  tier: 'T1' | 'T2' | 'T3' | 'insufficient_data';
  ticketCount: number;
  accuracy: number;      // percentage, e.g. 85.5
  avgConfidence: number; // percentage
}

interface TierReadinessTabProps {
  totalTicketsAnalyzed: number;
  categories: TierCategory[];
}

const TIER_THRESHOLDS = {
  T2: { accuracy: 90, tickets: 20 },
  T3: { accuracy: 98, tickets: 50 },
};

const tierConfig = {
  T3: {
    label: 'Tier 3 — Full Autonomy',
    badge: 'bg-emerald-100 text-emerald-800',
    dot: 'bg-emerald-500',
    desc: 'AI acts independently with no human approval required.',
  },
  T2: {
    label: 'Tier 2 — Supervised',
    badge: 'bg-blue-100 text-blue-800',
    dot: 'bg-blue-500',
    desc: 'AI suggests; agent approves before any write action.',
  },
  T1: {
    label: 'Tier 1 — Human Required',
    badge: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
    desc: 'Human must approve every action. Building evidence.',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    badge: 'bg-gray-100 text-gray-600',
    dot: 'bg-gray-400',
    desc: `Fewer than ${TIER_THRESHOLDS.T2.tickets} tickets analysed. Keep collecting data.`,
  },
};

function AccuracyBar({ accuracy, tier }: { accuracy: number; tier: TierCategory['tier'] }) {
  const targetAccuracy =
    tier === 'T3' ? 100 :
    tier === 'T2' ? TIER_THRESHOLDS.T3.accuracy :
    TIER_THRESHOLDS.T2.accuracy;

  const pct = Math.min((accuracy / targetAccuracy) * 100, 100);

  const barColor =
    tier === 'T3' ? 'bg-emerald-500' :
    tier === 'T2' ? 'bg-blue-500' :
    tier === 'T1' ? 'bg-amber-500' :
    'bg-gray-400';

  const targetLabel =
    tier === 'T3' ? null :
    tier === 'T2' ? `${TIER_THRESHOLDS.T3.accuracy}% for T3` :
    `${TIER_THRESHOLDS.T2.accuracy}% for T2`;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">Accuracy</span>
        <span className="text-xs font-semibold text-gray-800">{accuracy.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {targetLabel && (
        <p className="text-xs text-gray-400 mt-1">Target: {targetLabel}</p>
      )}
    </div>
  );
}

function TicketProgress({ ticketCount, tier }: { ticketCount: number; tier: TierCategory['tier'] }) {
  const target =
    tier === 'T3' ? TIER_THRESHOLDS.T3.tickets :
    tier === 'T2' ? TIER_THRESHOLDS.T3.tickets :
    TIER_THRESHOLDS.T2.tickets;

  const pct = Math.min((ticketCount / target) * 100, 100);

  if (tier === 'T3') {
    return (
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{ticketCount}</span> tickets analysed
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">Tickets</span>
        <span className="text-xs font-semibold text-gray-800">{ticketCount} / {target}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gray-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function NextStepHint({ category }: { category: TierCategory }) {
  const { tier, accuracy, ticketCount } = category;

  if (tier === 'T3') {
    return <p className="text-xs text-emerald-600 font-medium mt-2">✓ Fully autonomous</p>;
  }

  const targetTier = tier === 'T2' ? 'T3' : 'T2';
  const threshold = tier === 'T2' ? TIER_THRESHOLDS.T3 : TIER_THRESHOLDS.T2;
  const needs: string[] = [];

  if (accuracy < threshold.accuracy) {
    needs.push(`${(threshold.accuracy - accuracy).toFixed(1)}% more accuracy`);
  }
  if (ticketCount < threshold.tickets) {
    needs.push(`${threshold.tickets - ticketCount} more tickets`);
  }

  if (needs.length === 0) {
    return (
      <p className="text-xs text-blue-600 font-medium mt-2">
        Ready to promote to {targetTier} — review criteria met
      </p>
    );
  }

  return (
    <p className="text-xs text-gray-400 mt-2">
      To reach {targetTier}: {needs.join(' and ')}
    </p>
  );
}

function SummaryBar({ categories, totalTicketsAnalyzed }: { categories: TierCategory[]; totalTicketsAnalyzed: number }) {
  const counts = {
    T3: categories.filter((c) => c.tier === 'T3').length,
    T2: categories.filter((c) => c.tier === 'T2').length,
    T1: categories.filter((c) => c.tier === 'T1').length,
    insufficient_data: categories.filter((c) => c.tier === 'insufficient_data').length,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Analysed</p>
          <p className="text-2xl font-bold text-gray-900">{totalTicketsAnalyzed.toLocaleString()}</p>
          <p className="text-xs text-gray-400">tickets</p>
        </div>
        <div className="w-px h-10 bg-gray-200 hidden sm:block" />
        {counts.T3 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{counts.T3}</p>
              <p className="text-xs text-gray-500">Tier 3</p>
            </div>
          </div>
        )}
        {counts.T2 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{counts.T2}</p>
              <p className="text-xs text-gray-500">Tier 2</p>
            </div>
          </div>
        )}
        {counts.T1 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{counts.T1}</p>
              <p className="text-xs text-gray-500">Tier 1</p>
            </div>
          </div>
        )}
        {counts.insufficient_data > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{counts.insufficient_data}</p>
              <p className="text-xs text-gray-500">No data</p>
            </div>
          </div>
        )}
        <div className="ml-auto text-right hidden sm:block">
          <p className="text-xs text-gray-500">Thresholds</p>
          <p className="text-xs text-gray-400">T2: ≥90% acc, 20+ tickets</p>
          <p className="text-xs text-gray-400">T3: ≥98% acc, 50+ tickets</p>
        </div>
      </div>
    </div>
  );
}

export default function TierReadinessTab({ totalTicketsAnalyzed, categories }: TierReadinessTabProps) {
  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tier Data Yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Tier readiness data populates from <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ticket_analytics</code>{' '}
          once the AI categorisation cron runs and human reviews are logged.
        </p>
      </div>
    );
  }

  const order: TierCategory['tier'][] = ['T3', 'T2', 'T1', 'insufficient_data'];
  const sorted = [...categories].sort(
    (a, b) => order.indexOf(a.tier) - order.indexOf(b.tier)
  );

  return (
    <div className="space-y-6">
      <SummaryBar categories={categories} totalTicketsAnalyzed={totalTicketsAnalyzed} />

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['T1', 'T2', 'T3'] as const).map((t) => {
          const cfg = tierConfig[t];
          return (
            <div key={t} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
              <div>
                <p className="text-sm font-semibold text-gray-800">{cfg.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{cfg.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((cat) => {
          const cfg = tierConfig[cat.tier];
          return (
            <div key={cat.category} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">{cat.category}</h3>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                  {cat.tier === 'insufficient_data' ? 'No data' : cat.tier}
                </span>
              </div>

              <AccuracyBar accuracy={cat.accuracy} tier={cat.tier} />
              <TicketProgress ticketCount={cat.ticketCount} tier={cat.tier} />

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Avg confidence</span>
                <span className="font-medium text-gray-700">{cat.avgConfidence.toFixed(1)}%</span>
              </div>

              <NextStepHint category={cat} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
