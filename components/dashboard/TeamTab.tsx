'use client';

import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ScoreRing } from "@/components/ui/score-ring";
import { SectionHeader } from "@/components/ui/section-header";
import { ChartCard } from "@/components/ui/chart-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

const BarChart = dynamic(
  () => import("@tremor/react").then((m) => m.BarChart),
  { ssr: false },
);

const BarList = dynamic(
  () => import("@tremor/react").then((m) => m.BarList),
  { ssr: false },
);

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface LeaderboardEntry {
  agent: string;
  score: number;
  totalActions: number;
  replies: number;
  closes: number;
  escalations: number;
  escalationRate: number;
  avgResponseMin: number | null;
  avgCsat: number | null;
  reopens: number;
}

interface WorkloadDay {
  date: string;
  agents: Record<string, number>;
}

interface ActivityEntry {
  agent: string;
  action: string;
  ticketId: number;
  ticketSubject: string | null;
  occurredAt: string;
}

interface MacroStat {
  macroName: string;
  usageCount: number;
  avgResolutionMin: number | null;
}

export interface TeamSummary {
  leaderboard: LeaderboardEntry[];
  workloadByDay: WorkloadDay[];
  recentActivity: ActivityEntry[];
  macroStats?: MacroStat[];
}

interface TeamTabProps {
  data: TeamSummary | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function escRateColor(rate: number): string {
  if (rate < 5) return "text-emerald-600";
  if (rate <= 15) return "text-amber-600";
  return "text-red-600";
}

function responseClasses(min: number | null): { bg: string; icon: typeof ArrowDown } {
  if (min === null) return { bg: "", icon: ArrowDown };
  if (min < 5) return { bg: "bg-emerald-50 text-emerald-700", icon: ArrowDown };
  if (min <= 15) return { bg: "bg-amber-50 text-amber-700", icon: ArrowDown };
  return { bg: "bg-red-50 text-red-700", icon: ArrowUp };
}

function formatMin(min: number | null): string {
  if (min === null) return "\u2014";
  if (min < 1) return "<1m";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function actionVariant(action: string): "info" | "good" | "bad" | "neutral" {
  switch (action) {
    case "reply":
    case "reply_ticket":
      return "info";
    case "close":
      return "good";
    case "escalation":
      return "bad";
    default:
      return "neutral";
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case "reply":
    case "reply_ticket":
      return "Reply";
    case "close":
      return "Close";
    case "escalation":
      return "Escalation";
    case "assign":
    case "assign_ticket":
      return "Assign";
    default:
      return action;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function TeamTab({ data }: TeamTabProps) {
  if (!data) {
    return (
      <EmptyState
        title="No Team Data"
        description="Team performance data is not available yet. Check back once agents have started handling tickets."
      />
    );
  }

  const { leaderboard, workloadByDay, recentActivity } = data;
  const macroStats = data.macroStats ?? [];

  /* --- Workload chart data transformation --- */
  const agentNames = Array.from(
    new Set(workloadByDay.flatMap((d) => Object.keys(d.agents))),
  );

  const chartData = workloadByDay.map((day) => {
    const row: Record<string, string | number> = { date: day.date };
    for (const name of agentNames) {
      row[name] = day.agents[name] ?? 0;
    }
    return row;
  });

  return (
    <div className="space-y-6">
      {/* 1. Agent Leaderboard */}
      <section>
        <SectionHeader title="Agent Leaderboard" subtitle="Last 30 days" />
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-left font-medium">Score</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
                <th className="px-4 py-3 text-right font-medium">Replies</th>
                <th className="hidden md:table-cell px-4 py-3 text-right font-medium">Closes</th>
                <th className="px-4 py-3 text-right font-medium">Esc Rate</th>
                <th className="px-4 py-3 text-right font-medium">Avg Response</th>
                <th className="hidden md:table-cell px-4 py-3 text-right font-medium">CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {leaderboard.map((entry, idx) => {
                const resp = responseClasses(entry.avgResponseMin);
                const ResponseIcon = resp.icon;

                return (
                  <tr key={entry.agent} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {entry.agent}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ScoreRing value={entry.score} size={36} />
                        <span className="font-bold text-ironside-gold">
                          {entry.score}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">
                      {entry.totalActions}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">
                      {entry.replies}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right font-mono text-sm text-slate-700">
                      {entry.closes}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm ${escRateColor(entry.escalationRate)}`}>
                        {entry.escalationRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.avgResponseMin !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-sm ${resp.bg}`}
                        >
                          <ResponseIcon className="h-3 w-3" />
                          {formatMin(entry.avgResponseMin)}
                        </span>
                      ) : (
                        <span className="text-slate-400">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right font-mono text-sm text-slate-700">
                      {entry.avgCsat !== null ? (
                        <span>{entry.avgCsat}/5</span>
                      ) : (
                        <span className="text-slate-400">{"\u2014"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Workload Chart */}
      <section>
        <ChartCard
          title="Daily Workload"
          subtitle="Actions per agent, last 14 days"
        >
          {chartData.length > 0 ? (
            <BarChart
              data={chartData}
              index="date"
              categories={agentNames}
              stack
              className="h-72"
              yAxisWidth={40}
            />
          ) : (
            <p className="py-12 text-center text-sm text-slate-400">
              No workload data available.
            </p>
          )}
        </ChartCard>
      </section>

      {/* 3. Macro Usage */}
      {macroStats.length > 0 && (
        <section>
          <ChartCard title="Macro Usage" subtitle="Most used macros, last 30 days">
            <BarList
              data={macroStats.map((m) => ({
                name: m.macroName,
                value: m.usageCount,
              }))}
            />
          </ChartCard>
        </section>
      )}

      {/* 4. Recent Activity */}
      <section>
        <SectionHeader title="Recent Activity" />
        <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-50">
          {recentActivity.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              No recent activity.
            </p>
          ) : (
            recentActivity.map((entry, idx) => (
              <div
                key={`${entry.ticketId}-${entry.occurredAt}-${idx}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-shrink-0 pt-0.5">
                  <StatusBadge variant={actionVariant(entry.action)}>
                    {actionLabel(entry.action)}
                  </StatusBadge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 text-sm">
                      {entry.agent}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      #{entry.ticketId}
                    </span>
                    {entry.ticketSubject && (
                      <span
                        className="truncate text-sm text-slate-500 max-w-[280px]"
                        title={entry.ticketSubject}
                      >
                        {entry.ticketSubject}
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex-shrink-0 text-xs text-slate-400 whitespace-nowrap">
                  {relativeTime(entry.occurredAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
