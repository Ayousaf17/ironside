'use client';

import type { PulseCheck } from '@/types/pulse';

interface TicketFlowPanelProps {
  pulse: PulseCheck | null;
}

export default function TicketFlowPanel({ pulse }: TicketFlowPanelProps) {
  if (!pulse) return null;

  const spamCount = Math.round((pulse.spam_pct / 100) * pulse.ticket_count);
  const realTickets = pulse.ticket_count - spamCount;
  const rawUnassigned = pulse.workload['Unassigned'] ?? 0;
  const autoCloseCount = pulse.tags['auto-close'] ?? 0;
  const trueUnassigned = Math.max(0, rawUnassigned - autoCloseCount);
  const assignedCount = Math.max(0, realTickets - trueUnassigned - pulse.open_count);

  const totalPct = (n: number) =>
    pulse.ticket_count > 0 ? Math.round((n / pulse.ticket_count) * 100) : 0;
  const realPct = (n: number) =>
    realTickets > 0 ? Math.round((n / realTickets) * 100) : 0;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-900">Ticket Flow</h3>
        <p className="text-xs text-gray-500">Where does the chaos actually land? ({pulse.ticket_count} tickets this period)</p>
      </div>

      {/* Top flow: total → spam → real */}
      <div className="flex items-center gap-3 flex-wrap">
        <FlowBox
          count={pulse.ticket_count}
          label="Total Tickets"
          colorClass="bg-blue-50 border-blue-200 text-blue-800"
          dotClass="bg-blue-500"
        />
        <Arrow />
        <FlowBox
          count={spamCount}
          label={`Spam / Auto-close (${totalPct(spamCount)}%)`}
          colorClass="bg-orange-50 border-orange-200 text-orange-800"
          dotClass="bg-orange-400"
          sub="Bots handling bots. Circle of life."
        />
        <Arrow />
        <FlowBox
          count={realTickets}
          label={`Real Support (${totalPct(realTickets)}%)`}
          colorClass="bg-emerald-50 border-emerald-200 text-emerald-800"
          dotClass="bg-emerald-500"
          highlighted
        />
      </div>

      {/* Divider */}
      <div className="mt-4 mb-3 border-t border-gray-100" />

      {/* Bottom breakdown: assigned | unassigned | open */}
      <div className="text-xs text-gray-500 mb-2 font-medium">
        Of {realTickets} real support tickets:
      </div>
      <div className="flex items-stretch gap-3 flex-wrap">
        <BreakdownBox
          count={assignedCount}
          label="Assigned"
          pct={realPct(assignedCount)}
          colorClass="bg-emerald-50 border-emerald-200"
          labelClass="text-emerald-700"
          countClass="text-emerald-900"
        />
        <BreakdownBox
          count={trueUnassigned}
          label="True Queue"
          pct={realPct(trueUnassigned)}
          colorClass={trueUnassigned > 15 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-200'}
          labelClass={trueUnassigned > 15 ? 'text-red-600' : 'text-amber-700'}
          countClass={trueUnassigned > 15 ? 'text-red-900 font-bold' : 'text-amber-900'}
          badge={trueUnassigned > 15 ? 'Needs attention' : undefined}
        />
        <BreakdownBox
          count={pulse.open_count}
          label="Still Open"
          pct={realPct(pulse.open_count)}
          colorClass="bg-purple-50 border-purple-200"
          labelClass="text-purple-700"
          countClass="text-purple-900"
        />
      </div>

      {/* Context note */}
      {autoCloseCount > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          Those {autoCloseCount} &ldquo;unassigned&rdquo; tickets with the auto-close tag? They&apos;re
          spam waiting to meet their maker. Not counted in the True Queue — no heroics required.
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <div className="text-gray-300 text-lg font-light select-none hidden sm:block">→</div>
  );
}

interface FlowBoxProps {
  count: number;
  label: string;
  colorClass: string;
  dotClass: string;
  sub?: string;
  highlighted?: boolean;
}

function FlowBox({ count, label, colorClass, dotClass, sub, highlighted }: FlowBoxProps) {
  return (
    <div className={`flex-1 min-w-[140px] rounded-lg border px-4 py-3 ${colorClass} ${highlighted ? 'ring-2 ring-emerald-300' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{count}</div>
      {sub && <div className="text-xs mt-0.5 opacity-70">{sub}</div>}
    </div>
  );
}

interface BreakdownBoxProps {
  count: number;
  label: string;
  pct: number;
  colorClass: string;
  labelClass: string;
  countClass: string;
  badge?: string;
}

function BreakdownBox({ count, label, pct, colorClass, labelClass, countClass, badge }: BreakdownBoxProps) {
  return (
    <div className={`flex-1 min-w-[120px] rounded-lg border px-4 py-3 ${colorClass}`}>
      <div className={`text-xs font-medium mb-1 ${labelClass}`}>{label}</div>
      <div className={`text-xl font-bold ${countClass}`}>{count}</div>
      <div className={`text-xs mt-0.5 ${labelClass} opacity-80`}>{pct}% of real</div>
      {badge && (
        <span className="mt-1.5 inline-block text-[10px] font-semibold rounded-full bg-red-100 text-red-700 px-2 py-0.5">
          {badge}
        </span>
      )}
    </div>
  );
}
