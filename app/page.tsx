'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { PulseCheck } from '@/types/pulse';
import Tabs from '@/components/dashboard/Tabs';
import PulseHeroCards from '@/components/dashboard/PulseHeroCards';
import ResolutionChart from '@/components/dashboard/ResolutionChart';
import RatesTrendChart from '@/components/dashboard/RatesTrendChart';
import TopCategories from '@/components/dashboard/TopCategories';
import OpsNotes from '@/components/dashboard/OpsNotes';
import WorkloadChart from '@/components/dashboard/WorkloadChart';
import TagTrendsChart from '@/components/dashboard/TagTrendsChart';
import P90TrendChart from '@/components/dashboard/P90TrendChart';
import OpsNotesHistory from '@/components/dashboard/OpsNotesHistory';
import TicketFlowPanel from '@/components/dashboard/TicketFlowPanel';
import AgentBehaviorTab, { type AgentBehaviorLog } from '@/components/dashboard/AgentBehaviorTab';
import AutomationControlTab from '@/components/dashboard/AutomationControlTab';
import { type TierCategory } from '@/components/dashboard/TierReadinessTab';
import AiPerformanceTab, { type AiAnalytics } from '@/components/dashboard/AiPerformanceTab';
import FeedbackLoopTab, { type FeedbackLoopData } from '@/components/dashboard/FeedbackLoopTab';
import ReportingTab, { type ReportingData } from '@/components/dashboard/ReportingTab';

type TimePeriod = '7d' | '30d' | '90d' | 'all';

function filterByPeriod(data: PulseCheck[], period: TimePeriod): PulseCheck[] {
  if (period === 'all') return data;
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const cutoff = new Date(Date.now() - daysMap[period] * 86400000);
  return data.filter((p) => new Date(p.created_at) >= cutoff);
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="mt-4 text-gray-500 text-sm">Loading Command Center...</p>
        </div>
      </div>
    }>
      <SupportCommandCenter />
    </Suspense>
  );
}

function SupportCommandCenter() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get('tab') || 'operations';
  const initialPeriod = (searchParams.get('period') || '30d') as TimePeriod;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(initialPeriod);
  const [pulseData, setPulseData] = useState<PulseCheck[]>([]);
  const [behaviorLogs, setBehaviorLogs] = useState<AgentBehaviorLog[]>([]);
  const [tierCategories, setTierCategories] = useState<TierCategory[]>([]);
  const [totalTicketsAnalyzed, setTotalTicketsAnalyzed] = useState(0);
  const [aiAnalytics, setAiAnalytics] = useState<AiAnalytics | null>(null);
  const [feedbackData, setFeedbackData] = useState<FeedbackLoopData | null>(null);
  const [reportingData, setReportingData] = useState<ReportingData | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trendsData, setTrendsData] = useState<Record<string, any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analyticsData, setAnalyticsData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tabErrors, setTabErrors] = useState<Record<string, string>>({});

  const updateUrl = useCallback((tab: string, period: TimePeriod) => {
    const params = new URLSearchParams();
    if (tab !== 'operations') params.set('tab', tab);
    if (period !== '30d') params.set('period', period);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/', { scroll: false });
  }, [router]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    updateUrl(tab, timePeriod);
  }, [timePeriod, updateUrl]);

  const handlePeriodChange = useCallback((period: TimePeriod) => {
    setTimePeriod(period);
    updateUrl(activeTab, period);
  }, [activeTab, updateUrl]);

  useEffect(() => {
    async function safeFetch(tab: string): Promise<{ tab: string; data: Record<string, unknown> | null; error?: string }> {
      try {
        const res = await fetch(`/api/dashboard?tab=${tab}`);
        if (!res.ok) return { tab, data: null, error: `HTTP ${res.status}` };
        return { tab, data: await res.json() };
      } catch (err) {
        return { tab, data: null, error: err instanceof Error ? err.message : 'Network error' };
      }
    }

    const fetchAll = async () => {
      const results = await Promise.all([
        safeFetch('pulse'),
        safeFetch('behavior'),
        safeFetch('tiers'),
        safeFetch('ai'),
        safeFetch('feedback'),
        safeFetch('reporting'),
        safeFetch('trends'),
        safeFetch('analytics'),
      ]);

      const errors: Record<string, string> = {};
      for (const r of results) {
        if (r.error) {
          errors[r.tab] = r.error;
          continue;
        }
        if (!r.data) continue;
        if (r.tab === 'pulse' && r.data.data) setPulseData(r.data.data as PulseCheck[]);
        if (r.tab === 'behavior' && r.data.data) setBehaviorLogs(r.data.data as AgentBehaviorLog[]);
        if (r.tab === 'tiers' && r.data.categories) {
          setTierCategories(r.data.categories as TierCategory[]);
          setTotalTicketsAnalyzed((r.data.totalTicketsAnalyzed as number) ?? 0);
        }
        if (r.tab === 'ai' && r.data.today) setAiAnalytics(r.data as unknown as AiAnalytics);
        if (r.tab === 'feedback' && r.data.tab === 'feedback') setFeedbackData(r.data as unknown as FeedbackLoopData);
        if (r.tab === 'reporting' && r.data.tab === 'reporting') setReportingData(r.data as unknown as ReportingData);
        if (r.tab === 'trends' && r.data.tab === 'trends') setTrendsData(r.data as Record<string, unknown>);
        if (r.tab === 'analytics' && r.data.tab === 'analytics') setAnalyticsData(r.data as Record<string, unknown>);
      }
      setTabErrors(errors);
      // Only show full-page error if ALL tabs failed
      if (Object.keys(errors).length === 8) {
        setError('All dashboard data sources failed. Please refresh.');
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  const filteredPulseData = filterByPeriod(pulseData, timePeriod);
  const latestPulse = pulseData[0] ?? null;
  const previousPulse = pulseData[1] ?? null;
  const pulseCount = filteredPulseData.length;
  const dateRangeLabel =
    latestPulse ? formatDateRange(latestPulse.date_range_start, latestPulse.date_range_end) : '';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="mt-4 text-gray-500 text-sm">Loading Command Center...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ironside Support Command Center</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-gray-500">Live support operations insights for Ironside Computers</p>
              {dateRangeLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Latest: {dateRangeLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Tabs activeTab={activeTab} onTabChange={handleTabChange} />
            {(activeTab === 'operations' || activeTab === 'deep-dive') && (
              <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-0.5 text-xs">
                {(['7d', '30d', '90d', 'all'] as TimePeriod[]).map((period) => (
                  <button
                    key={period}
                    onClick={() => handlePeriodChange(period)}
                    className={`rounded-full px-3 py-1 font-medium transition-all duration-200 ${
                      timePeriod === period
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {period === 'all' ? 'All' : period.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab error banner */}
        {(() => {
          const tabKeyMap: Record<string, string> = {
            operations: 'pulse',
            'agent-behavior': 'behavior',
            'automation-control': 'tiers',
            'feedback-loop': 'feedback',
            'ai-performance': 'ai',
            'deep-dive': 'pulse',
            reporting: 'reporting',
            trends: 'trends',
            analytics: 'analytics',
          };
          const errKey = tabKeyMap[activeTab];
          const errMsg = errKey ? tabErrors[errKey] : undefined;
          if (!errMsg) return null;
          return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This tab failed to load data: {errMsg}. Other tabs may still work.
            </div>
          );
        })()}

        {/* OPERATIONS TAB */}
        {activeTab === 'operations' && (
          <div className="space-y-8">
            {pulseData.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pulse Check Data Yet</h3>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Pulse check data will appear here once the cron job runs. Trigger it manually at{' '}
                  <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/api/cron/pulse-check</code>.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Showing {pulseCount} pulse check{pulseCount !== 1 ? 's' : ''}
                    {timePeriod !== 'all' ? ` from last ${timePeriod}` : ''}
                  </span>
                  {latestPulse && (
                    <span>
                      Last updated:{' '}
                      {new Date(latestPulse.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
                <PulseHeroCards latest={latestPulse} previous={previousPulse} />
                <div className="grid gap-8 md:grid-cols-2">
                  <ResolutionChart data={filteredPulseData} />
                  <RatesTrendChart data={filteredPulseData} />
                </div>
                <TicketFlowPanel pulse={latestPulse} />
                <div className="grid gap-8 md:grid-cols-2">
                  <TopCategories data={latestPulse?.top_questions ?? []} previousData={previousPulse?.top_questions} />
                  <OpsNotes notes={latestPulse?.ops_notes ?? []} timestamp={latestPulse?.created_at ?? ''} pulse={latestPulse ?? undefined} />
                </div>
              </>
            )}
          </div>
        )}

        {/* AGENT BEHAVIOR TAB */}
        {activeTab === 'agent-behavior' && (
          <AgentBehaviorTab logs={behaviorLogs} />
        )}

        {/* AUTOMATION CONTROL TAB */}
        {activeTab === 'automation-control' && (
          <AutomationControlTab
            totalTicketsAnalyzed={totalTicketsAnalyzed}
            categories={tierCategories}
          />
        )}

        {/* FEEDBACK LOOP TAB */}
        {activeTab === 'feedback-loop' && (
          <FeedbackLoopTab data={feedbackData} />
        )}

        {/* DEEP DIVE TAB */}
        {activeTab === 'deep-dive' && (
          <div className="space-y-8">
            {pulseData.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Deep Dive Data Yet</h3>
                <p className="text-sm text-gray-500">Deep dive analytics populate after pulse checks start flowing.</p>
              </div>
            ) : (
              <>
                <div className="text-xs text-gray-500">
                  Analyzing {pulseCount} pulse check{pulseCount !== 1 ? 's' : ''}
                  {timePeriod !== 'all' ? ` from last ${timePeriod}` : ''}
                </div>
                <WorkloadChart data={filteredPulseData} />
                <div className="grid gap-8 md:grid-cols-2">
                  <TagTrendsChart data={filteredPulseData} />
                  <P90TrendChart data={filteredPulseData} />
                </div>
                <OpsNotesHistory data={filteredPulseData} />
              </>
            )}
          </div>
        )}

        {/* AI PERFORMANCE TAB */}
        {activeTab === 'ai-performance' && (
          <AiPerformanceTab data={aiAnalytics} />
        )}

        {/* REPORTING TAB */}
        {activeTab === 'reporting' && (
          <ReportingTab data={reportingData} />
        )}

        {/* TRENDS TAB */}
        {activeTab === 'trends' && (
          <div className="space-y-8">
            {!trendsData ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Trend Data Yet</h3>
                <p className="text-sm text-gray-500">Trends populate after multiple pulse checks run over time.</p>
              </div>
            ) : (
              <>
                {/* Spike Alert */}
                {trendsData.spikeAlert?.detected && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <strong>Volume Spike:</strong> {trendsData.spikeAlert.currentVolume} tickets today vs {trendsData.spikeAlert.avgVolume} avg ({trendsData.spikeAlert.multiplier}x normal)
                  </div>
                )}

                {/* Daily Volume */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Ticket Volume (30 days)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 pr-4">Date</th>
                          <th className="pb-2 pr-4">Tickets</th>
                          <th className="pb-2 pr-4">Open</th>
                          <th className="pb-2 pr-4">Closed</th>
                          <th className="pb-2 pr-4">Spam %</th>
                          <th className="pb-2 pr-4">P90 (min)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(trendsData.dailyVolume as { date: string; tickets: number; open: number; closed: number; spamPct: number; p90Min: number }[])?.slice(-14).map((d) => (
                          <tr key={d.date} className="border-b border-gray-50">
                            <td className="py-1.5 pr-4 font-mono text-xs">{d.date}</td>
                            <td className="py-1.5 pr-4 font-semibold">{d.tickets}</td>
                            <td className="py-1.5 pr-4">{d.open}</td>
                            <td className="py-1.5 pr-4">{d.closed}</td>
                            <td className="py-1.5 pr-4">{d.spamPct}%</td>
                            <td className="py-1.5 pr-4">{d.p90Min > 0 ? `${d.p90Min.toFixed(0)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Agent Scores */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Performance (30 days)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 pr-4">Agent</th>
                          <th className="pb-2 pr-4">Actions</th>
                          <th className="pb-2 pr-4">Replies</th>
                          <th className="pb-2 pr-4">Escalations</th>
                          <th className="pb-2 pr-4">Esc. Rate</th>
                          <th className="pb-2 pr-4">Avg Response</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(trendsData.agentScores as { agent: string; totalActions: number; replies: number; escalations: number; escalationRate: number; avgResponseMin: number | null }[])?.map((a) => (
                          <tr key={a.agent} className="border-b border-gray-50">
                            <td className="py-1.5 pr-4 font-medium">{a.agent}</td>
                            <td className="py-1.5 pr-4">{a.totalActions}</td>
                            <td className="py-1.5 pr-4">{a.replies}</td>
                            <td className="py-1.5 pr-4">{a.escalations}</td>
                            <td className="py-1.5 pr-4">{a.escalationRate}%</td>
                            <td className="py-1.5 pr-4">{a.avgResponseMin != null ? `${a.avgResponseMin} min` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sentiment Trend */}
                {(trendsData.sentimentTrend as { date: string; angry: number; frustrated: number; happy: number; neutral: number }[])?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Sentiment Trend</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="pb-2 pr-4">Date</th>
                            <th className="pb-2 pr-4 text-red-600">Angry</th>
                            <th className="pb-2 pr-4 text-amber-600">Frustrated</th>
                            <th className="pb-2 pr-4 text-emerald-600">Happy</th>
                            <th className="pb-2 pr-4 text-gray-500">Neutral</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(trendsData.sentimentTrend as { date: string; angry: number; frustrated: number; happy: number; neutral: number }[]).map((s) => (
                            <tr key={s.date} className="border-b border-gray-50">
                              <td className="py-1.5 pr-4 font-mono text-xs">{s.date}</td>
                              <td className="py-1.5 pr-4 text-red-600 font-medium">{s.angry || '—'}</td>
                              <td className="py-1.5 pr-4 text-amber-600">{s.frustrated || '—'}</td>
                              <td className="py-1.5 pr-4 text-emerald-600">{s.happy || '—'}</td>
                              <td className="py-1.5 pr-4 text-gray-500">{s.neutral || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            {!analyticsData ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Analytics Data Yet</h3>
                <p className="text-sm text-gray-500">Analytics populate after agent sessions and ticket processing.</p>
              </div>
            ) : (
              <>
                {/* KPI Cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Cost / Ticket</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {analyticsData.costAnalysis?.costPerTicket != null ? `$${analyticsData.costAnalysis.costPerTicket}` : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{analyticsData.costAnalysis?.totalTickets ?? 0} tickets · ${analyticsData.costAnalysis?.totalLlmCost ?? 0} total</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Time Saved</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">
                      {analyticsData.timeSaved?.totalSavedHours != null ? `${analyticsData.timeSaved.totalSavedHours}h` : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {analyticsData.timeSaved?.savedPerTicketMin != null ? `${analyticsData.timeSaved.savedPerTicketMin} min/ticket` : 'Calculating...'}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">AI Accuracy</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {analyticsData.aiAccuracy?.accuracy != null ? `${analyticsData.aiAccuracy.accuracy}%` : '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{analyticsData.aiAccuracy?.judged ?? 0} tickets judged</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Cost Savings</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">
                      ${analyticsData.costSavings?.totalUsd ?? 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{analyticsData.costSavings?.ticketsAnalyzed ?? 0} tickets analyzed</p>
                  </div>
                </div>

                {/* Agent Leaderboard */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Leaderboard (30 days)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Agent</th>
                          <th className="pb-2 pr-4">Score</th>
                          <th className="pb-2 pr-4">Actions</th>
                          <th className="pb-2 pr-4">Replies</th>
                          <th className="pb-2 pr-4">Closes</th>
                          <th className="pb-2 pr-4">Esc. Rate</th>
                          <th className="pb-2 pr-4">Avg Response</th>
                          <th className="pb-2 pr-4">CSAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analyticsData.leaderboard as { agent: string; score: number; totalActions: number; replies: number; closes: number; escalationRate: number; avgResponseMin: number | null; avgCsat: number | null }[])?.map((a, i) => (
                          <tr key={a.agent} className="border-b border-gray-50">
                            <td className="py-1.5 pr-4 font-mono text-xs text-gray-400">{i + 1}</td>
                            <td className="py-1.5 pr-4 font-medium">{a.agent}</td>
                            <td className="py-1.5 pr-4 font-bold text-blue-600">{a.score}</td>
                            <td className="py-1.5 pr-4">{a.totalActions}</td>
                            <td className="py-1.5 pr-4">{a.replies}</td>
                            <td className="py-1.5 pr-4">{a.closes}</td>
                            <td className="py-1.5 pr-4">{a.escalationRate}%</td>
                            <td className="py-1.5 pr-4">{a.avgResponseMin != null ? `${a.avgResponseMin} min` : '—'}</td>
                            <td className="py-1.5 pr-4">{a.avgCsat != null ? `${a.avgCsat}/5` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
