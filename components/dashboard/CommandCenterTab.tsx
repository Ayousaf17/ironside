'use client';

import dynamic from 'next/dynamic';
import { Ticket, Clock, ShieldX, UserX, CheckCircle } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { AlertBanner } from '@/components/ui/alert-banner';
import { ChartCard } from '@/components/ui/chart-card';
import { EmptyState } from '@/components/ui/empty-state';

const AreaChart = dynamic(
  () => import('@tremor/react').then((m) => m.AreaChart),
  { ssr: false },
);

const BarList = dynamic(
  () => import('@tremor/react').then((m) => m.BarList),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VolumeSpike {
  detected: boolean;
  multiplier: number;
  currentVolume: number;
  avgVolume: number;
}

interface DashboardSummary {
  system: {
    status: 'healthy' | 'degraded' | 'down';
    lastPulse: string | null;
    queuedOps: number;
  };
  alerts: {
    slaBreaches: number;
    staleTickets: number;
    volumeSpike: VolumeSpike | null;
  };
  metrics: {
    openTickets: number;
    openDelta: number;
    responseP90Min: number;
    responseP90Delta: number;
    spamPct: number;
    spamDelta: number;
    unassignedPct: number;
    unassignedDelta: number;
    slaCompliancePct: number;
    slaDelta: number;
  };
  resolutionTrend: { date: string; p50: number; p90: number }[];
  categoryBreakdown: { name: string; count: number }[];
  ticketFlow: { open: number; assigned: number; closed: number; spam: number };
  opsNotes: string[];
}

interface CommandCenterTabProps {
  data: DashboardSummary | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAlerts(data: DashboardSummary) {
  const alerts: { type: 'sla' | 'spike' | 'stale'; message: string }[] = [];

  if (data.alerts.slaBreaches > 0) {
    alerts.push({
      type: 'sla',
      message: `${data.alerts.slaBreaches} SLA breaches`,
    });
  }

  if (data.alerts.volumeSpike?.detected) {
    alerts.push({
      type: 'spike',
      message: `Volume spike: ${data.alerts.volumeSpike.currentVolume} tickets (${data.alerts.volumeSpike.multiplier}x normal)`,
    });
  }

  if (data.alerts.staleTickets > 0) {
    alerts.push({
      type: 'stale',
      message: `${data.alerts.staleTickets} stale tickets (no response >24h)`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Ticket Flow Bar
// ---------------------------------------------------------------------------

const FLOW_SEGMENTS: {
  key: keyof DashboardSummary['ticketFlow'];
  label: string;
  color: string;
  textColor: string;
}[] = [
  { key: 'closed', label: 'Closed', color: 'bg-emerald-500', textColor: 'text-white' },
  { key: 'assigned', label: 'Assigned', color: 'bg-blue-500', textColor: 'text-white' },
  { key: 'open', label: 'Open', color: 'bg-amber-400', textColor: 'text-amber-900' },
  { key: 'spam', label: 'Spam', color: 'bg-red-500', textColor: 'text-white' },
];

function TicketFlowBar({ flow }: { flow: DashboardSummary['ticketFlow'] }) {
  const total = flow.open + flow.assigned + flow.closed + flow.spam;

  if (total === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Ticket Flow</h3>

      {/* Segmented bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-full">
        {FLOW_SEGMENTS.map(({ key, color }) => {
          const pct = (flow[key] / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              className={`${color} transition-all duration-300`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4">
        {FLOW_SEGMENTS.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
            {label}: {flow[key]}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandCenterTab({ data }: CommandCenterTabProps) {
  if (!data) {
    return (
      <EmptyState
        title="No Data Yet"
        description="Dashboard data will appear here once the first pulse check completes."
      />
    );
  }

  const alerts = buildAlerts(data);
  const { metrics, resolutionTrend, categoryBreakdown, ticketFlow, opsNotes } = data;

  return (
    <div className="space-y-6">
      {/* 1. Alert Banner */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* 2. Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Open Tickets"
          icon={Ticket}
          value={metrics.openTickets}
          delta={metrics.openDelta}
          deltaInverted
        />
        <MetricCard
          label="P90 Response"
          icon={Clock}
          value={`${metrics.responseP90Min}m`}
          delta={metrics.responseP90Delta}
          deltaInverted
          unit="min"
        />
        <MetricCard
          label="Spam Rate"
          icon={ShieldX}
          value={`${metrics.spamPct}%`}
          delta={metrics.spamDelta}
          deltaInverted
          unit="%"
        />
        <MetricCard
          label="Unassigned"
          icon={UserX}
          value={`${metrics.unassignedPct}%`}
          delta={metrics.unassignedDelta}
          deltaInverted
          unit="%"
        />
        <MetricCard
          label="SLA Compliance"
          icon={CheckCircle}
          value={`${metrics.slaCompliancePct}%`}
          delta={metrics.slaDelta}
          unit="%"
        />
      </div>

      {/* 3. Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartCard title="Resolution Trend" subtitle="P50 and P90 over 30 days">
          <AreaChart
            data={resolutionTrend}
            index="date"
            categories={['p50', 'p90']}
            colors={['blue', 'indigo']}
            yAxisWidth={48}
            showAnimation
          />
        </ChartCard>

        <ChartCard title="Top Categories">
          <BarList
            data={categoryBreakdown.map((c) => ({ name: c.name, value: c.count }))}
          />
        </ChartCard>
      </div>

      {/* 4. Ticket Flow */}
      <TicketFlowBar flow={ticketFlow} />

      {/* 5. Ops Notes */}
      {opsNotes.length > 0 && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <summary className="cursor-pointer select-none px-6 py-4 text-sm font-semibold text-slate-900">
            Ops Notes ({opsNotes.length})
          </summary>
          <ul className="px-6 pb-4 list-disc list-inside space-y-1 text-sm text-slate-600">
            {opsNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
