'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Ticket, Clock, ShieldX, UserX, CheckCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { AlertBanner } from '@/components/ui/alert-banner';
import { ChartCard } from '@/components/ui/chart-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorsPanel } from './ErrorsPanel';

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

interface TicketDetail {
  id: number;
  subject: string;
  assignee: string;
  ageHours: number;
}

interface CategoryP90 {
  category: string;
  p90Min: number;
  ticketCount: number;
}

export interface OperationsData {
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
  slaBreachTickets?: TicketDetail[];
  staleTicketsList?: TicketDetail[];
  categoryP90?: CategoryP90[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAlerts(data: OperationsData) {
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
// Expandable Ticket Detail
// ---------------------------------------------------------------------------

function ExpandableTicketList({
  title,
  count,
  tickets,
  variant,
}: {
  title: string;
  count: number;
  tickets: TicketDetail[];
  variant: 'sla' | 'stale';
}) {
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  const colors = variant === 'sla'
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-orange-50 border-orange-200 text-orange-800';

  return (
    <div className={`rounded-xl border ${colors}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>{count} {title}</span>
        {tickets.length > 0 && (
          expanded
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {expanded && tickets.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          {tickets.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-medium">#{t.id}</span>
                <span className="truncate max-w-[200px]" title={t.subject}>{t.subject}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-slate-500">{t.assignee}</span>
                <span className="font-mono">{t.ageHours}h</span>
                <a
                  href={`https://ironsidecomputers.gorgias.com/app/tickets/${t.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-70"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket Flow Bar
// ---------------------------------------------------------------------------

const FLOW_SEGMENTS: {
  key: keyof OperationsData['ticketFlow'];
  label: string;
  color: string;
  textColor: string;
}[] = [
  { key: 'closed', label: 'Closed', color: 'bg-emerald-500', textColor: 'text-white' },
  { key: 'assigned', label: 'Assigned', color: 'bg-blue-500', textColor: 'text-white' },
  { key: 'open', label: 'Open', color: 'bg-amber-400', textColor: 'text-amber-900' },
  { key: 'spam', label: 'Spam', color: 'bg-red-500', textColor: 'text-white' },
];

function TicketFlowBar({ flow }: { flow: OperationsData['ticketFlow'] }) {
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

export default function OperationsTab({ data }: { data: OperationsData }) {
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
  const slaBreachTickets = data.slaBreachTickets ?? [];
  const staleTicketsList = data.staleTicketsList ?? [];
  const categoryP90 = data.categoryP90 ?? [];

  return (
    <div className="space-y-6">
      {/* 1. Alert Banner + Expandable Details */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}
      <ExpandableTicketList
        title="SLA breaches"
        count={data.alerts.slaBreaches}
        tickets={slaBreachTickets}
        variant="sla"
      />
      <ExpandableTicketList
        title="stale tickets (no response >24h)"
        count={data.alerts.staleTickets}
        tickets={staleTicketsList}
        variant="stale"
      />

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

      {/* 3b. Category P90 Response Times */}
      {categoryP90.length > 0 && (
        <ChartCard title="Response P90 by Category" subtitle="Minutes to first response (90th percentile)">
          <BarList
            data={categoryP90.map((c) => ({ name: c.category, value: c.p90Min }))}
          />
        </ChartCard>
      )}

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

      {/* 6. Errors Panel */}
      <ErrorsPanel />
    </div>
  );
}
