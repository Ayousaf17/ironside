'use client';

import { useState } from 'react';

export interface WeeklyRollup {
  week: string;
  totalTickets: number;
  avgResolutionMin: number | null;
  p90Min: number | null;
  spamPct: number | null;
  agentActions: number;
  agentBreakdown: { agent: string; actions: number }[];
  aiAccuracy: number | null;
  aiJudged: number;
}

export interface MonthlySummary {
  month: string;
  totalTickets: number;
  avgResolutionMin: number | null;
  totalAgentActions: number;
  pulseChecks: number;
}

export interface ReportingData {
  tab: string;
  weeklyRollups: WeeklyRollup[];
  monthlySummary: MonthlySummary[];
  aiCosts: { totalRequests: number; totalTokens: number; totalCostUsd: number };
}

function buildCsvContent(data: ReportingData): string {
  const lines: string[] = [];
  lines.push('Weekly Report');
  lines.push('Week,Tickets,Avg Resolution (min),P90 (min),Spam %,Agent Actions,AI Accuracy %,AI Judged');
  for (const w of data.weeklyRollups) {
    lines.push([
      w.week,
      w.totalTickets,
      w.avgResolutionMin ?? '',
      w.p90Min ?? '',
      w.spamPct ?? '',
      w.agentActions,
      w.aiAccuracy ?? '',
      w.aiJudged,
    ].join(','));
  }
  lines.push('');
  lines.push('Monthly Summary');
  lines.push('Month,Tickets,Avg Resolution (min),Agent Actions,Pulse Checks');
  for (const m of data.monthlySummary) {
    lines.push([m.month, m.totalTickets, m.avgResolutionMin ?? '', m.totalAgentActions, m.pulseChecks].join(','));
  }
  lines.push('');
  lines.push('AI Costs');
  lines.push(`Total Requests,${data.aiCosts.totalRequests}`);
  lines.push(`Total Tokens,${data.aiCosts.totalTokens}`);
  lines.push(`Total Cost (USD),${data.aiCosts.totalCostUsd}`);
  return lines.join('\n');
}

export default function ReportingTab({ data }: { data: ReportingData | null }) {
  const [copied, setCopied] = useState(false);

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Reporting Data Yet</h3>
        <p className="text-sm text-gray-500">Reports populate after pulse checks and agent activity start flowing.</p>
      </div>
    );
  }

  const handleExport = () => {
    const csv = buildCsvContent(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ironside-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const csv = buildCsvContent(data);
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Leadership Report</h2>
          <p className="text-sm text-gray-500 mt-1">Weekly and monthly rollups for Robert and leadership review</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Weekly Rollups Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Weekly Rollups (Last 8 Weeks)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Week</th>
                <th className="px-6 py-3 text-right">Tickets</th>
                <th className="px-6 py-3 text-right">Avg Resolution</th>
                <th className="px-6 py-3 text-right">P90</th>
                <th className="px-6 py-3 text-right">Spam %</th>
                <th className="px-6 py-3 text-right">Agent Actions</th>
                <th className="px-6 py-3 text-right">AI Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.weeklyRollups.map((w) => (
                <tr key={w.week} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap">{w.week}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{w.totalTickets || '–'}</td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {w.avgResolutionMin !== null ? `${w.avgResolutionMin} min` : '–'}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {w.p90Min !== null ? `${w.p90Min} min` : '–'}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {w.spamPct !== null ? `${w.spamPct}%` : '–'}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">{w.agentActions || '–'}</td>
                  <td className="px-6 py-3 text-right">
                    {w.aiAccuracy !== null ? (
                      <span className={w.aiAccuracy >= 80 ? 'text-green-700' : w.aiAccuracy >= 60 ? 'text-amber-700' : 'text-red-700'}>
                        {w.aiAccuracy}%
                      </span>
                    ) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent Performance per Week (expandable within weekly data) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Agent Activity (Last 8 Weeks)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Week</th>
                <th className="px-6 py-3">Agent Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.weeklyRollups.map((w) => (
                <tr key={w.week} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap align-top">{w.week}</td>
                  <td className="px-6 py-3">
                    {w.agentBreakdown.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {w.agentBreakdown.map((a) => (
                          <span key={a.agent} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            {a.agent.split('@')[0]}: {a.actions}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">No activity</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Monthly Summary (Last 3 Months)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Month</th>
                <th className="px-6 py-3 text-right">Tickets</th>
                <th className="px-6 py-3 text-right">Avg Resolution</th>
                <th className="px-6 py-3 text-right">Agent Actions</th>
                <th className="px-6 py-3 text-right">Pulse Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.monthlySummary.map((m) => (
                <tr key={m.month} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{m.month}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{m.totalTickets || '–'}</td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {m.avgResolutionMin !== null ? `${m.avgResolutionMin} min` : '–'}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">{m.totalAgentActions || '–'}</td>
                  <td className="px-6 py-3 text-right text-gray-700">{m.pulseChecks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Cost Summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">AI Cost Summary (Last 3 Months)</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Requests</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{data.aiCosts.totalRequests.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Tokens</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{data.aiCosts.totalTokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Cost</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">${data.aiCosts.totalCostUsd.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
