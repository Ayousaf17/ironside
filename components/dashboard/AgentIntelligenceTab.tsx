'use client';

import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ScoreRing } from "@/components/ui/score-ring";
import { SectionHeader } from "@/components/ui/section-header";
import { ChartCard } from "@/components/ui/chart-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

const AreaChart = dynamic(
  () => import("@tremor/react").then((m) => m.AreaChart),
  { ssr: false },
);

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
  avgCharCount: number | null;
  firstResponseRate: number | null;
}

interface WeekPoint {
  week: string;
  avgResponseMin: number | null;
}

interface AgentTrend {
  agent: string;
  weeks: WeekPoint[];
}

interface AgentCategory {
  agent: string;
  category: string;
  count: number;
}

interface WorkloadDay {
  date: string;
  agents: Record<string, number>;
}

interface MacroStat {
  macroName: string;
  usageCount: number;
  avgResolutionMin: number | null;
}

interface MacroComparison {
  category: string;
  withMacroAvgMin: number | null;
  withoutMacroAvgMin: number | null;
}

interface AgentMacroUsage {
  agent: string;
  macroName: string;
  count: number;
}

interface MacroEffectiveness {
  macros: MacroStat[];
  macroVsNoMacro: MacroComparison[];
  agentMacroUsage: AgentMacroUsage[];
}

interface EscalationPattern {
  agent: string;
  category: string;
  count: number;
}

interface ResponseQuality {
  agent: string;
  avgCharCount: number | null;
  firstResponseRate: number | null;
}

interface ActivityEntry {
  agent: string;
  action: string;
  ticketId: number;
  ticketSubject: string | null;
  occurredAt: string;
}

export interface AgentIntelligenceData {
  leaderboard: LeaderboardEntry[];
  agentTrends: AgentTrend[];
  agentCategories: AgentCategory[];
  workloadByDay: WorkloadDay[];
  macroEffectiveness: MacroEffectiveness;
  escalationPatterns: EscalationPattern[];
  responseQuality: ResponseQuality[];
  recentActivity: ActivityEntry[];
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

export default function AgentIntelligenceTab({ data }: { data: AgentIntelligenceData | null }) {
  if (!data) {
    return (
      <EmptyState
        title="No Agent Data"
        description="Agent intelligence data will appear once behavior logs start flowing."
      />
    );
  }

  const {
    leaderboard,
    agentTrends,
    agentCategories,
    workloadByDay,
    macroEffectiveness,
    escalationPatterns,
    recentActivity,
  } = data;

  const macros = macroEffectiveness?.macros ?? [];
  const macroVsNoMacro = macroEffectiveness?.macroVsNoMacro ?? [];
  const agentMacroUsage = macroEffectiveness?.agentMacroUsage ?? [];

  /* --- Workload chart data --- */
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

  /* --- Agent-category heatmap data --- */
  const heatmapAgents = Array.from(
    new Set(agentCategories.map((ac) => ac.agent)),
  );
  const heatmapCategories = Array.from(
    new Set(agentCategories.map((ac) => ac.category)),
  );
  const maxCount =
    agentCategories.length > 0
      ? Math.max(...agentCategories.map((ac) => ac.count))
      : 1;

  function getCatCount(agent: string, category: string): number {
    return (
      agentCategories.find(
        (ac) => ac.agent === agent && ac.category === category,
      )?.count ?? 0
    );
  }

  /* --- Top 6 agents for trend charts --- */
  const trendAgentsSorted = [...leaderboard]
    .sort((a, b) => b.totalActions - a.totalActions)
    .slice(0, 6)
    .map((e) => e.agent);

  const trendDataForAgent = (agentName: string) => {
    const trend = agentTrends.find((t) => t.agent === agentName);
    if (!trend) return [];
    return trend.weeks.map((w) => ({
      week: w.week,
      "Avg Response (min)": w.avgResponseMin ?? 0,
    }));
  };

  const hasTrendData = agentTrends.length > 0 && agentTrends.some((t) =>
    t.weeks.some((w) => w.avgResponseMin !== null),
  );

  return (
    <div className="space-y-6">
      {/* 1. Agent Leaderboard */}
      <section>
        <SectionHeader title="Agent Leaderboard" subtitle="Last 30 days" />
        {leaderboard.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No Leaderboard Data"
              description="Agent leaderboard will populate once behavior logs are recorded."
            />
          </div>
        ) : (
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
                  <th className="px-4 py-3 text-right font-medium">Reopens</th>
                  <th className="px-4 py-3 text-right font-medium">Esc Rate</th>
                  <th className="px-4 py-3 text-right font-medium">Avg Response</th>
                  <th className="hidden md:table-cell px-4 py-3 text-right font-medium">Avg Chars</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-right font-medium">1st Resp %</th>
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
                      <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">
                        {entry.reopens}
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
                        {entry.avgCharCount !== null ? (
                          entry.avgCharCount
                        ) : (
                          <span className="text-slate-400">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-right font-mono text-sm text-slate-700">
                        {entry.firstResponseRate !== null ? (
                          `${entry.firstResponseRate}%`
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
        )}
      </section>

      {/* 2. Per-agent Response Time Trends */}
      {hasTrendData && (
        <section>
          <SectionHeader
            title="Response Time Trends"
            subtitle="Weekly avg response time per agent (top 6 by volume)"
          />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendAgentsSorted.map((agentName) => {
              const tData = trendDataForAgent(agentName);
              if (tData.length === 0) return null;

              return (
                <ChartCard key={agentName} title={agentName} subtitle="Avg response (min)">
                  <AreaChart
                    data={tData}
                    index="week"
                    categories={["Avg Response (min)"]}
                    colors={["blue"]}
                    className="h-36"
                    yAxisWidth={36}
                    showLegend={false}
                    curveType="monotone"
                  />
                </ChartCard>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Agent-Category Heatmap */}
      {agentCategories.length > 0 && (
        <section>
          <SectionHeader
            title="Agent-Category Heatmap"
            subtitle="Top 5 categories per agent, last 30 days"
          />
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                  {heatmapCategories.map((cat) => (
                    <th
                      key={cat}
                      className="px-4 py-3 text-center font-medium max-w-[120px] truncate"
                      title={cat}
                    >
                      {cat}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {heatmapAgents.map((agent) => (
                  <tr key={agent} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {agent}
                    </td>
                    {heatmapCategories.map((cat) => {
                      const count = getCatCount(agent, cat);
                      const opacity =
                        count > 0
                          ? Math.max(0.1, Math.min(0.8, count / maxCount))
                          : 0;

                      return (
                        <td key={cat} className="px-4 py-3 text-center">
                          {count > 0 ? (
                            <span
                              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 font-mono text-sm text-white min-w-[36px]"
                              style={{
                                backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                                color: opacity > 0.4 ? "white" : "rgb(59, 130, 246)",
                              }}
                            >
                              {count}
                            </span>
                          ) : (
                            <span className="text-slate-300">{"\u2014"}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. Daily Workload */}
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

      {/* 5. Macro Effectiveness */}
      {(macros.length > 0 || macroVsNoMacro.length > 0 || agentMacroUsage.length > 0) && (
        <section>
          <SectionHeader title="Macro Effectiveness" subtitle="Last 30 days" />

          <div className="mt-4 space-y-4">
            {/* 5a. Macro usage BarList */}
            {macros.length > 0 && (
              <ChartCard title="Macro Usage" subtitle="Most used macros">
                <BarList
                  data={macros.map((m) => ({
                    name: m.macroName,
                    value: m.usageCount,
                  }))}
                />
              </ChartCard>
            )}

            {/* 5b. Macro vs No Macro comparison table */}
            {macroVsNoMacro.length > 0 && (
              <ChartCard title="With Macro vs Without" subtitle="Avg response time by category">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 text-left font-medium">Category</th>
                        <th className="px-4 py-2 text-right font-medium">With Macro</th>
                        <th className="px-4 py-2 text-right font-medium">Without Macro</th>
                        <th className="px-4 py-2 text-right font-medium">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {macroVsNoMacro.map((row) => {
                        const diff =
                          row.withMacroAvgMin != null && row.withoutMacroAvgMin != null
                            ? Math.round(
                                (row.withMacroAvgMin - row.withoutMacroAvgMin) * 10,
                              ) / 10
                            : null;

                        return (
                          <tr key={row.category} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2 font-medium text-slate-900">
                              {row.category}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                              {formatMin(row.withMacroAvgMin)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                              {formatMin(row.withoutMacroAvgMin)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-sm">
                              {diff !== null ? (
                                <span
                                  className={
                                    diff < 0
                                      ? "text-emerald-600"
                                      : diff > 0
                                        ? "text-red-600"
                                        : "text-slate-500"
                                  }
                                >
                                  {diff > 0 ? "+" : ""}
                                  {formatMin(diff)}
                                </span>
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
              </ChartCard>
            )}

            {/* 5c. Per-agent macro usage */}
            {agentMacroUsage.length > 0 && (
              <ChartCard title="Agent Macro Usage" subtitle="Top macros by agent">
                <BarList
                  data={agentMacroUsage.map((m) => ({
                    name: `${m.agent} \u2014 ${m.macroName}`,
                    value: m.count,
                  }))}
                />
              </ChartCard>
            )}
          </div>
        </section>
      )}

      {/* 6. Escalation Patterns */}
      {escalationPatterns.length > 0 && (
        <section>
          <ChartCard
            title="Escalation Patterns"
            subtitle="Escalations by agent and category, last 30 days"
          >
            <BarList
              data={escalationPatterns.map((e) => ({
                name: `${e.agent} \u2014 ${e.category}`,
                value: e.count,
              }))}
            />
          </ChartCard>
        </section>
      )}

      {/* 7. Recent Activity */}
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
