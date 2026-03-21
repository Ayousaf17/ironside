'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Tabs from '@/components/dashboard/Tabs';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { TabSkeleton } from '@/components/ui/tab-skeleton';

// Dynamic imports — each tab is code-split and loaded on demand
const CommandCenterTab = dynamic(
  () => import('@/components/dashboard/CommandCenterTab').then(m => ({ default: m.CommandCenterTab })),
  { loading: () => <TabSkeleton /> }
);
const TeamTab = dynamic(
  () => import('@/components/dashboard/TeamTab'),
  { loading: () => <TabSkeleton /> }
);
const AiAutomationTab = dynamic(
  () => import('@/components/dashboard/AiAutomationTab'),
  { loading: () => <TabSkeleton /> }
);
const ReportsTab = dynamic(
  () => import('@/components/dashboard/ReportsTab'),
  { loading: () => <TabSkeleton /> }
);

// --- Types matching API response shapes ---

interface DashboardSummary {
  system: { status: 'healthy' | 'degraded' | 'down'; lastPulse: string | null; queuedOps: number };
  alerts: { slaBreaches: number; staleTickets: number; volumeSpike: { detected: boolean; multiplier: number; currentVolume: number; avgVolume: number } | null };
  metrics: { openTickets: number; openDelta: number; responseP90Min: number; responseP90Delta: number; spamPct: number; spamDelta: number; unassignedPct: number; unassignedDelta: number; slaCompliancePct: number; slaDelta: number };
  resolutionTrend: { date: string; p50: number; p90: number }[];
  categoryBreakdown: { name: string; count: number }[];
  ticketFlow: { open: number; assigned: number; closed: number; spam: number };
  opsNotes: string[];
}

interface TeamSummary {
  leaderboard: { agent: string; score: number; totalActions: number; replies: number; closes: number; escalations: number; escalationRate: number; avgResponseMin: number | null; avgCsat: number | null; reopens: number }[];
  workloadByDay: { date: string; agents: Record<string, number> }[];
  recentActivity: { agent: string; action: string; ticketId: number; ticketSubject: string | null; occurredAt: string }[];
}

interface AiSummary {
  kpis: { accuracy: number | null; judged: number; costPerTicket: number | null; totalLlmCost: number; totalSavedHours: number | null; savedPerTicketMin: number | null; totalCostSavings: number };
  tierReadiness: { category: string; tier: string; accuracy: number; ticketCount: number; avgConfidence: number }[];
  feedback: { overallAccuracy: number | null; recentCorrections: { ticketId: number; aiCategory: string; humanCategory: string; correctedAt: string }[]; matrix: { aiCategory: string; humanCategory: string; count: number }[] };
  sentimentTrend: { date: string; angry: number; frustrated: number; happy: number; neutral: number }[];
}

// --- Typed fetch wrappers ---

async function fetchSummary(): Promise<DashboardSummary> {
  const res = await fetch('/api/dashboard/summary');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchTeam(): Promise<TeamSummary> {
  const res = await fetch('/api/dashboard/team');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAi(): Promise<AiSummary> {
  const res = await fetch('/api/dashboard/ai');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Page ---

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-ironside-gold" />
      </div>
    }>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get('tab') || 'command-center';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Lazy-loaded data per tab — cached in state after first fetch
  const [summaryData, setSummaryData] = useState<DashboardSummary | null>(null);
  const [teamData, setTeamData] = useState<TeamSummary | null>(null);
  const [aiData, setAiData] = useState<AiSummary | null>(null);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // URL sync
  const updateUrl = useCallback((tab: string) => {
    const params = new URLSearchParams();
    if (tab !== 'command-center') params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/', { scroll: false });
  }, [router]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    updateUrl(tab);
  }, [updateUrl]);

  // Fetch data for a tab on first activation
  const fetchTabData = useCallback(async (tab: string) => {
    if (loading[tab]) return;

    // Skip if already loaded
    if (tab === 'command-center' && summaryData) return;
    if (tab === 'team' && teamData) return;
    if (tab === 'ai-automation' && aiData) return;
    if (tab === 'reports') return; // ReportsTab fetches its own data

    setLoading(prev => ({ ...prev, [tab]: true }));
    setErrors(prev => { const next = { ...prev }; delete next[tab]; return next; });

    try {
      if (tab === 'command-center') {
        setSummaryData(await fetchSummary());
      } else if (tab === 'team') {
        setTeamData(await fetchTeam());
      } else if (tab === 'ai-automation') {
        setAiData(await fetchAi());
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, [tab]: err instanceof Error ? err.message : 'Failed to load' }));
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
    }
  }, [loading, summaryData, teamData, aiData]);

  // Fetch Command Center on mount (it's the default tab)
  useEffect(() => {
    fetchTabData('command-center');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data when tab changes
  useEffect(() => {
    fetchTabData(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const isLoading = loading[activeTab];
  const error = errors[activeTab];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Dark branded header — always visible */}
      <DashboardHeader
        systemStatus={summaryData?.system.status ?? 'healthy'}
        lastPulse={summaryData?.system.lastPulse ?? null}
        queuedOps={summaryData?.system.queuedOps ?? 0}
      />

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Tab navigation */}
        <Tabs activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Tab error banner */}
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
            <span>Failed to load data: {error}</span>
            <button
              onClick={() => { setErrors(prev => { const next = { ...prev }; delete next[activeTab]; return next; }); fetchTabData(activeTab); }}
              className="text-amber-700 font-medium hover:text-amber-900 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && <TabSkeleton />}

        {/* Tab content */}
        {!isLoading && !error && (
          <>
            {activeTab === 'command-center' && (
              <CommandCenterTab data={summaryData} />
            )}

            {activeTab === 'team' && (
              <TeamTab data={teamData} />
            )}

            {activeTab === 'ai-automation' && (
              <AiAutomationTab data={aiData} />
            )}

            {activeTab === 'reports' && (
              <ReportsTab />
            )}
          </>
        )}
      </div>
    </div>
  );
}
