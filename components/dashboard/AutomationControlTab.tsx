'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TierCategory } from './TierReadinessTab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TierOverride { tier: string; reason: string; changedAt: string; }
interface TierHistoryEntry { category: string; fromTier: string; toTier: string; reason: string; changedAt: string; }
interface MacroStat { name: string; usageCount: number; }
interface AuditAction { id: string; ticketId: number; subject: string; category: string; action: string; agent: string; macroName: string | null; occurredAt: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  T3: { label: 'T3 — Full Autonomy',  badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  T2: { label: 'T2 — Supervised',     badge: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-500'    },
  T1: { label: 'T1 — Human Required', badge: 'bg-amber-100 text-amber-800',      dot: 'bg-amber-500'   },
  insufficient_data: { label: 'No Data', badge: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400'    },
};

const TIER_THRESHOLDS = { T2: { accuracy: 90, tickets: 20 }, T3: { accuracy: 98, tickets: 50 } };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tierRank(t: string) { return { T3: 0, T2: 1, T1: 2, insufficient_data: 3 }[t] ?? 2; }

function nextTier(current: string): string | null {
  const order = ['insufficient_data', 'T1', 'T2', 'T3'];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

function prevTier(current: string): string | null {
  const order = ['insufficient_data', 'T1', 'T2', 'T3'];
  const idx = order.indexOf(current);
  return idx > 0 ? order[idx - 1] : null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccuracyBar({ accuracy, tier }: { accuracy: number; tier: TierCategory['tier'] }) {
  const target = tier === 'T3' ? 100 : tier === 'T2' ? TIER_THRESHOLDS.T3.accuracy : TIER_THRESHOLDS.T2.accuracy;
  const pct = Math.min((accuracy / target) * 100, 100);
  const color = tier === 'T3' ? 'bg-emerald-500' : tier === 'T2' ? 'bg-blue-500' : tier === 'T1' ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-gray-500">Accuracy</span>
        <span className="text-xs font-semibold text-gray-800">{accuracy.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryBar({ categories, totalTicketsAnalyzed }: { categories: TierCategory[]; totalTicketsAnalyzed: number }) {
  const counts = { T3: 0, T2: 0, T1: 0, insufficient_data: 0 };
  for (const c of categories) counts[c.tier]++;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Analysed</p>
          <p className="text-2xl font-bold text-gray-900">{totalTicketsAnalyzed.toLocaleString()}</p>
          <p className="text-xs text-gray-400">tickets</p>
        </div>
        <div className="w-px h-10 bg-gray-200 hidden sm:block" />
        {(['T3', 'T2', 'T1'] as const).map((t) => counts[t] > 0 && (
          <div key={t} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${TIER_CONFIG[t].dot}`} />
            <div>
              <p className="text-sm font-semibold text-gray-900">{counts[t]}</p>
              <p className="text-xs text-gray-500">Tier {t.replace('T', '')}</p>
            </div>
          </div>
        ))}
        <div className="ml-auto text-right hidden sm:block">
          <p className="text-xs text-gray-500">Thresholds</p>
          <p className="text-xs text-gray-400">T2: ≥90% acc, 20+ tickets</p>
          <p className="text-xs text-gray-400">T3: ≥98% acc, 50+ tickets</p>
        </div>
      </div>
    </div>
  );
}

// ─── Category Card with Promote/Demote ───────────────────────────────────────

function CategoryCard({
  cat,
  override,
  onSetTier,
  onClearOverride,
  saving,
}: {
  cat: TierCategory;
  override: TierOverride | undefined;
  onSetTier: (category: string, tier: string, reason: string) => void;
  onClearOverride: (category: string) => void;
  saving: boolean;
}) {
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [showDemoteDialog, setShowDemoteDialog] = useState(false);
  const [reason, setReason] = useState('');

  const effectiveTier = override?.tier ?? cat.tier;
  const cfg = TIER_CONFIG[effectiveTier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.T1;
  const canPromote = nextTier(effectiveTier) !== null;
  const canDemote = prevTier(effectiveTier) !== null;

  function handlePromote() {
    const target = nextTier(effectiveTier);
    if (!target) return;
    onSetTier(cat.category, target, reason || `Manual promote from ${effectiveTier} to ${target}`);
    setShowPromoteDialog(false);
    setReason('');
  }

  function handleDemote() {
    const target = prevTier(effectiveTier);
    if (!target) return;
    onSetTier(cat.category, target, reason || `Manual demote from ${effectiveTier} to ${target}`);
    setShowDemoteDialog(false);
    setReason('');
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">{cat.category}</h3>
        <div className="flex items-center gap-1.5">
          {override && (
            <span className="text-xs text-purple-600 font-medium bg-purple-50 rounded-full px-2 py-0.5">
              Manual
            </span>
          )}
          <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
            {effectiveTier === 'insufficient_data' ? 'No data' : effectiveTier}
          </span>
        </div>
      </div>

      <AccuracyBar accuracy={cat.accuracy} tier={cat.tier} />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Tickets</span>
        <span className="font-medium text-gray-700">{cat.ticketCount}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Avg confidence</span>
        <span className="font-medium text-gray-700">{cat.avgConfidence.toFixed(1)}%</span>
      </div>

      {override && (
        <p className="text-xs text-gray-400">
          Overridden {fmtTime(override.changedAt)}{override.reason ? ` — ${override.reason}` : ''}
        </p>
      )}

      {/* Promote/Demote buttons */}
      <div className="flex gap-2 pt-1">
        {canPromote && !showPromoteDialog && !showDemoteDialog && (
          <button
            onClick={() => setShowPromoteDialog(true)}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            ↑ Promote
          </button>
        )}
        {canDemote && !showPromoteDialog && !showDemoteDialog && (
          <button
            onClick={() => setShowDemoteDialog(true)}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            ↓ Demote
          </button>
        )}
        {override && !showPromoteDialog && !showDemoteDialog && (
          <button
            onClick={() => onClearOverride(cat.category)}
            className="text-xs font-medium py-1.5 px-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
            title="Clear manual override, revert to computed tier"
          >
            Reset
          </button>
        )}
      </div>

      {/* Promote dialog */}
      {showPromoteDialog && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-600 font-medium">
            Promote to <span className="text-emerald-700">{nextTier(effectiveTier)}</span>
          </p>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePromote}
              disabled={saving}
              className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => { setShowPromoteDialog(false); setReason(''); }}
              className="flex-1 text-xs py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Demote dialog */}
      {showDemoteDialog && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-600 font-medium">
            Demote to <span className="text-red-600">{prevTier(effectiveTier)}</span>
          </p>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDemote}
              disabled={saving}
              className="flex-1 text-xs py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => { setShowDemoteDialog(false); setReason(''); }}
              className="flex-1 text-xs py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Routing Rules Editor ─────────────────────────────────────────────────────

function RoutingEditor() {
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/automation?section=routing')
      .then((r) => r.json())
      .then((d) => { setRouting(d.routing ?? {}); setDraft(d.routing ?? {}); })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-routing', routing: draft }),
      });
      setRouting(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const isDirty = JSON.stringify(routing) !== JSON.stringify(draft);

  if (loading) return <div className="text-xs text-gray-400 p-4">Loading routing rules…</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Routing Rules</h3>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      <div className="space-y-2">
        {Object.entries(draft).map(([category, email]) => (
          <div key={category} className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-700 w-44 shrink-0">{category.replace(/_/g, ' ')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setDraft((prev) => ({ ...prev, [category]: e.target.value }))}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Macro Analytics ──────────────────────────────────────────────────────────

function MacroAnalytics() {
  const [macros, setMacros] = useState<MacroStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/automation?section=macros')
      .then((r) => r.json())
      .then((d) => setMacros(d.macros ?? []))
      .finally(() => setLoading(false));
  }, []);

  const maxCount = macros[0]?.usageCount ?? 1;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Macro Usage (Last 30 Days)</h3>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : macros.length === 0 ? (
        <p className="text-xs text-gray-400">No macro usage logged yet.</p>
      ) : (
        <div className="space-y-2.5">
          {macros.map((m) => (
            <div key={m.name} className="flex items-center gap-3">
              <span className="text-xs text-gray-700 w-48 shrink-0 truncate" title={m.name}>{m.name}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full"
                  style={{ width: `${(m.usageCount / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600 w-6 text-right">{m.usageCount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── T3 Audit Feed ────────────────────────────────────────────────────────────

function T3AuditFeed() {
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [t3Cats, setT3Cats] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/automation?section=t3-audit')
      .then((r) => r.json())
      .then((d) => { setActions(d.actions ?? []); setT3Cats(d.t3Categories ?? []); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">T3 Audit Feed</h3>
        {t3Cats.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {t3Cats.map((c) => (
              <span key={c} className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">{c}</span>
            ))}
          </div>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : t3Cats.length === 0 ? (
        <p className="text-xs text-gray-400">No T3 categories yet. Promote a category to T3 to start seeing autonomous actions here.</p>
      ) : actions.length === 0 ? (
        <p className="text-xs text-gray-400">No autonomous actions logged for T3 categories yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {actions.map((a) => (
            <div key={a.id} className="py-2.5 flex items-start gap-3">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-800 truncate">
                  <span className="font-medium">#{a.ticketId}</span> — {a.subject || '(no subject)'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {a.action}{a.macroName ? ` · ${a.macroName}` : ''} · {a.category} · {a.agent}
                </p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">{fmtTime(a.occurredAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tier Decision History ────────────────────────────────────────────────────

function TierHistory({ history }: { history: TierHistoryEntry[] }) {
  if (history.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Tier Decision History</h3>
      <div className="divide-y divide-gray-100">
        {history.slice(0, 10).map((h, i) => (
          <div key={i} className="py-2.5 flex items-center gap-3">
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${TIER_CONFIG[h.toTier as keyof typeof TIER_CONFIG]?.badge ?? 'bg-gray-100 text-gray-600'}`}>
              {h.toTier}
            </span>
            <span className="text-xs text-gray-400">←</span>
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${TIER_CONFIG[h.fromTier as keyof typeof TIER_CONFIG]?.badge ?? 'bg-gray-100 text-gray-600'}`}>
              {h.fromTier}
            </span>
            <span className="text-xs font-medium text-gray-800">{h.category}</span>
            {h.reason && <span className="text-xs text-gray-500 truncate flex-1">{h.reason}</span>}
            <span className="text-xs text-gray-400 shrink-0">{fmtTime(h.changedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

interface AutomationControlTabProps {
  totalTicketsAnalyzed: number;
  categories: TierCategory[];
}

export default function AutomationControlTab({ totalTicketsAnalyzed, categories }: AutomationControlTabProps) {
  const [overrides, setOverrides] = useState<Record<string, TierOverride>>({});
  const [history, setHistory] = useState<TierHistoryEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const loadOverrides = useCallback(async () => {
    const res = await fetch('/api/automation?section=overrides');
    const d = await res.json();
    setOverrides(d.overrides ?? {});
    setHistory(d.history ?? []);
  }, []);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  async function handleSetTier(category: string, tier: string, reason: string) {
    setSaving(true);
    try {
      await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-tier', category, tier, reason }),
      });
      await loadOverrides();
    } finally {
      setSaving(false);
    }
  }

  async function handleClearOverride(category: string) {
    setSaving(true);
    try {
      await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear-tier', category }),
      });
      await loadOverrides();
    } finally {
      setSaving(false);
    }
  }

  const sorted = [...categories].sort(
    (a, b) => tierRank(overrides[a.category]?.tier ?? a.tier) - tierRank(overrides[b.category]?.tier ?? b.tier),
  );

  if (categories.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tier Data Yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Tier data populates from <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ticket_analytics</code> once
            the AI categorisation cron runs and human reviews are logged.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <RoutingEditor />
          <MacroAnalytics />
        </div>
        <T3AuditFeed />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryBar categories={sorted} totalTicketsAnalyzed={totalTicketsAnalyzed} />

      {/* Tier legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['T1', 'T2', 'T3'] as const).map((t) => {
          const descs: Record<string, string> = {
            T1: 'Human must approve every action.',
            T2: 'AI suggests; agent approves before writing.',
            T3: 'AI acts independently — no approval required.',
          };
          return (
            <div key={t} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${TIER_CONFIG[t].dot}`} />
              <div>
                <p className="text-sm font-semibold text-gray-800">{TIER_CONFIG[t].label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{descs[t]}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((cat) => (
          <CategoryCard
            key={cat.category}
            cat={cat}
            override={overrides[cat.category]}
            onSetTier={handleSetTier}
            onClearOverride={handleClearOverride}
            saving={saving}
          />
        ))}
      </div>

      <TierHistory history={history} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RoutingEditor />
        <MacroAnalytics />
      </div>

      <T3AuditFeed />
    </div>
  );
}
