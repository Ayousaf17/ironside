'use client';

export interface AgentBehaviorLog {
  id: string;
  created_at: string;
  event_type: string;
  ticket_id: number;
  ticket_subject: string | null;
  ticket_channel: string | null;
  ticket_category: string | null;
  ticket_tags: string[] | null;
  agent_name: string | null;
  agent_email: string | null;
  response_char_count: number | null;
  is_macro: boolean | null;
  macro_name: string | null;
  message_position: number | null;
  time_to_first_response_min: number | null;
  touches_to_resolution: number | null;
  csat_score: number | null;
  resolved_at: string | null;
}

interface AgentStats {
  name: string;
  replies: number;
  firstResponses: number;
  avgFirstResponseMin: number | null;
  macroUses: number;
  macroRate: number;
  csatScores: number[];
  avgCsat: number | null;
  ticketIds: Set<number>;
  touchSamples: number[];
  avgTouches: number | null;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function formatMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function eventLabel(type: string): { label: string; color: string } {
  switch (type) {
    case 'ticket-message-created': return { label: 'Reply', color: 'bg-blue-100 text-blue-700' };
    case 'ticket-assigned': return { label: 'Assigned', color: 'bg-purple-100 text-purple-700' };
    case 'ticket-closed': return { label: 'Closed', color: 'bg-green-100 text-green-700' };
    default: return { label: type, color: 'bg-gray-100 text-gray-600' };
  }
}

function computeAgentStats(logs: AgentBehaviorLog[]): AgentStats[] {
  const map = new Map<string, AgentStats>();

  for (const row of logs) {
    if (!row.agent_name) continue;
    if (row.event_type !== 'ticket-message-created') continue;

    if (!map.has(row.agent_name)) {
      map.set(row.agent_name, {
        name: row.agent_name,
        replies: 0,
        firstResponses: 0,
        avgFirstResponseMin: null,
        macroUses: 0,
        macroRate: 0,
        csatScores: [],
        avgCsat: null,
        ticketIds: new Set(),
        touchSamples: [],
        avgTouches: null,
      });
    }

    const s = map.get(row.agent_name)!;
    s.replies++;
    s.ticketIds.add(row.ticket_id);

    if (row.time_to_first_response_min !== null) {
      s.firstResponses++;
      // accumulate in avgFirstResponseMin temporarily as sum
      s.avgFirstResponseMin = (s.avgFirstResponseMin ?? 0) + row.time_to_first_response_min;
    }

    if (row.is_macro) s.macroUses++;
    if (row.csat_score !== null) s.csatScores.push(row.csat_score);
    if (row.touches_to_resolution !== null) s.touchSamples.push(row.touches_to_resolution);
  }

  return Array.from(map.values())
    .map((s) => ({
      ...s,
      avgFirstResponseMin: s.firstResponses > 0 ? (s.avgFirstResponseMin ?? 0) / s.firstResponses : null,
      macroRate: s.replies > 0 ? Math.round((s.macroUses / s.replies) * 100) : 0,
      avgCsat: avg(s.csatScores),
      avgTouches: avg(s.touchSamples),
    }))
    .sort((a, b) => b.replies - a.replies);
}

interface AgentBehaviorTabProps {
  logs: AgentBehaviorLog[];
}

export default function AgentBehaviorTab({ logs }: AgentBehaviorTabProps) {
  const replyLogs = logs.filter((l) => l.event_type === 'ticket-message-created');
  const agentStats = computeAgentStats(logs);

  const totalReplies = replyLogs.length;
  const activeAgents = agentStats.length;
  const allFirstResponses = replyLogs
    .filter((l) => l.time_to_first_response_min !== null)
    .map((l) => l.time_to_first_response_min as number);
  const avgFirst = avg(allFirstResponses);
  const macroReplies = replyLogs.filter((l) => l.is_macro).length;
  const macroRate = totalReplies > 0 ? Math.round((macroReplies / totalReplies) * 100) : 0;

  // Recent activity — last 30 rows across all event types
  const recent = [...logs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 30);

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Agent Activity Logged Yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          The Gorgias webhook is live and listening. Data will appear here as soon as Spencer or Danni-Jean
          reply to a ticket. Check back after the next support shift.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Webhook: /api/webhooks/gorgias/events — capturing replies, assignments, closures, and CSAT
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Replies Logged" value={totalReplies.toString()} sub="agent messages captured" />
        <StatCard label="Active Agents" value={activeAgents.toString()} sub="handling tickets" />
        <StatCard label="Avg First Response" value={formatMin(avgFirst)} sub="from ticket open to reply" />
        <StatCard
          label="Macro Usage Rate"
          value={`${macroRate}%`}
          sub={`${macroReplies} of ${totalReplies} replies used a macro`}
          highlight={macroRate > 50}
        />
      </div>

      {/* Per-agent breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Agent Breakdown</h3>
          <p className="text-xs text-gray-500 mt-0.5">Performance by team member — the scoreboard nobody asked for but everyone needs</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left font-medium">Agent</th>
                <th className="px-6 py-3 text-right font-medium">Replies</th>
                <th className="px-6 py-3 text-right font-medium">Tickets</th>
                <th className="px-6 py-3 text-right font-medium">Avg First Response</th>
                <th className="px-6 py-3 text-right font-medium">Macro Rate</th>
                <th className="px-6 py-3 text-right font-medium">Avg Touches</th>
                <th className="px-6 py-3 text-right font-medium">Avg CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {agentStats.map((agent) => (
                <tr key={agent.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-gray-900">{agent.replies}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{agent.ticketIds.size}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatMin(agent.avgFirstResponseMin)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      agent.macroRate > 60 ? 'bg-green-100 text-green-700' :
                      agent.macroRate > 30 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {agent.macroRate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">
                    {agent.avgTouches !== null ? agent.avgTouches.toFixed(1) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {agent.avgCsat !== null ? (
                      <span className={`font-medium ${agent.avgCsat >= 4 ? 'text-green-600' : agent.avgCsat >= 3 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {agent.avgCsat.toFixed(1)} / 5
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <p className="text-xs text-gray-500 mt-0.5">Last 30 logged events — replies, assignments, closures</p>
        </div>
        <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
          {recent.map((row) => {
            const { label, color } = eventLabel(row.event_type);
            const time = new Date(row.created_at).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            });
            return (
              <div key={row.id} className="px-6 py-3.5 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
                    {label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm">{row.agent_name ?? 'Unknown'}</span>
                    {row.ticket_subject && (
                      <span className="text-gray-500 text-sm truncate max-w-[320px]" title={row.ticket_subject}>
                        — {row.ticket_subject}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    <span>Ticket #{row.ticket_id}</span>
                    {row.ticket_category && <span>· {row.ticket_category}</span>}
                    {row.ticket_channel && <span>· {row.ticket_channel}</span>}
                    {row.is_macro && row.macro_name && (
                      <span className="text-green-600 font-medium">· Macro: {row.macro_name}</span>
                    )}
                    {row.time_to_first_response_min !== null && (
                      <span className="text-blue-500">· First reply in {formatMin(row.time_to_first_response_min)}</span>
                    )}
                    {row.csat_score !== null && (
                      <span className={row.csat_score >= 4 ? 'text-green-600' : 'text-yellow-600'}>
                        · CSAT {row.csat_score}/5
                      </span>
                    )}
                    {row.touches_to_resolution !== null && (
                      <span>· {row.touches_to_resolution} touch{row.touches_to_resolution !== 1 ? 'es' : ''} to resolve</span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">{time}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-6 rounded-xl border shadow-sm ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
      <h3 className="text-sm font-medium text-gray-500">{label}</h3>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
