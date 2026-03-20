'use client';

import { useEffect, useState } from 'react';
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

export default function SupportCommandCenter() {
  const [activeTab, setActiveTab] = useState('operations');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');
  const [pulseData, setPulseData] = useState<PulseCheck[]>([]);
  const [behaviorLogs, setBehaviorLogs] = useState<AgentBehaviorLog[]>([]);
  const [tierCategories, setTierCategories] = useState<TierCategory[]>([]);
  const [totalTicketsAnalyzed, setTotalTicketsAnalyzed] = useState(0);
  const [aiAnalytics, setAiAnalytics] = useState<AiAnalytics | null>(null);
  const [feedbackData, setFeedbackData] = useState<FeedbackLoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tabErrors, setTabErrors] = useState<Record<string, string>>({});

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
      }
      setTabErrors(errors);
      // Only show full-page error if ALL tabs failed
      if (Object.keys(errors).length === 5) {
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
            <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
            {(activeTab === 'operations' || activeTab === 'deep-dive') && (
              <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-0.5 text-xs">
                {(['7d', '30d', '90d', 'all'] as TimePeriod[]).map((period) => (
                  <button
                    key={period}
                    onClick={() => setTimePeriod(period)}
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
      </div>
    </div>
  );
}
