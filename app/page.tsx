'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Tabs from '@/components/dashboard/Tabs';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { TabSkeleton } from '@/components/ui/tab-skeleton';
import { EmptyState } from '@/components/ui/empty-state';

// Dynamic imports — each tab is code-split and loaded on demand
const OperationsTab = dynamic(
  () => import('@/components/dashboard/OperationsTab'),
  { loading: () => <TabSkeleton /> }
);
const AgentIntelligenceTab = dynamic(
  () => import('@/components/dashboard/AgentIntelligenceTab'),
  { loading: () => <TabSkeleton /> }
);
const TierReadinessTab = dynamic(
  () => import('@/components/dashboard/TierReadinessTab'),
  { loading: () => <TabSkeleton /> }
);
const CostDataTab = dynamic(
  () => import('@/components/dashboard/CostDataTab'),
  { loading: () => <TabSkeleton /> }
);

// --- Typed fetch wrappers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTab(endpoint: string): Promise<any> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Map old tab IDs to new ones for backward compatibility
const TAB_REDIRECTS: Record<string, string> = {
  'command-center': 'operations',
  'team': 'agent-intelligence',
  'ai-automation': 'tier-readiness',
  'reports': 'cost-data',
};

const TAB_ENDPOINTS: Record<string, string> = {
  'operations': '/api/dashboard/operations',
  'agent-intelligence': '/api/dashboard/agent-intelligence',
  'tier-readiness': '/api/dashboard/tier-readiness',
  'cost-data': '/api/dashboard/cost-data',
};

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

  // Handle old tab IDs
  const rawTab = searchParams.get('tab') || 'operations';
  const resolvedTab = TAB_REDIRECTS[rawTab] ?? rawTab;
  const [activeTab, setActiveTab] = useState(resolvedTab);

  // Generic data cache per tab
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tabData, setTabData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // URL sync
  const updateUrl = useCallback((tab: string) => {
    const params = new URLSearchParams();
    if (tab !== 'operations') params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/', { scroll: false });
  }, [router]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    updateUrl(tab);
  }, [updateUrl]);

  // Fetch data for a tab on first activation
  const fetchTabData = useCallback(async (tab: string) => {
    if (loading[tab] || tabData[tab]) return;

    const endpoint = TAB_ENDPOINTS[tab];
    if (!endpoint) return;

    setLoading(prev => ({ ...prev, [tab]: true }));
    setErrors(prev => { const next = { ...prev }; delete next[tab]; return next; });

    try {
      const data = await fetchTab(endpoint);
      setTabData(prev => ({ ...prev, [tab]: data }));
    } catch (err) {
      setErrors(prev => ({ ...prev, [tab]: err instanceof Error ? err.message : 'Failed to load' }));
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
    }
  }, [loading, tabData]);

  // Fetch default tab on mount
  useEffect(() => {
    fetchTabData('operations');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data when tab changes
  useEffect(() => {
    fetchTabData(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const isLoading = loading[activeTab];
  const error = errors[activeTab];
  const opsData = tabData['operations'];

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader
        systemStatus={opsData?.system?.status ?? 'healthy'}
        lastPulse={opsData?.system?.lastPulse ?? null}
        queuedOps={opsData?.system?.queuedOps ?? 0}
      />

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Tabs activeTab={activeTab} onTabChange={handleTabChange} />

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
            <span>Failed to load data: {error}</span>
            <button
              onClick={() => {
                setErrors(prev => { const next = { ...prev }; delete next[activeTab]; return next; });
                setTabData(prev => { const next = { ...prev }; delete next[activeTab]; return next; });
                fetchTabData(activeTab);
              }}
              className="text-amber-700 font-medium hover:text-amber-900 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && <TabSkeleton />}

        {!isLoading && !error && (
          <>
            {activeTab === 'operations' && (
              tabData['operations']
                ? <OperationsTab data={tabData['operations']} />
                : <EmptyState title="No Data Yet" description="Operations data will appear once the first pulse check completes." />
            )}

            {activeTab === 'agent-intelligence' && (
              tabData['agent-intelligence']
                ? <AgentIntelligenceTab data={tabData['agent-intelligence']} />
                : <EmptyState title="No Agent Data" description="Agent intelligence data will appear once behavior logs start flowing." />
            )}

            {activeTab === 'tier-readiness' && (
              tabData['tier-readiness']
                ? <TierReadinessTab data={tabData['tier-readiness']} />
                : <EmptyState title="No Tier Data" description="Tier readiness data will appear once AI classification runs accumulate." />
            )}

            {activeTab === 'cost-data' && (
              tabData['cost-data']
                ? <CostDataTab data={tabData['cost-data']} />
                : <EmptyState title="No Cost Data" description="Cost and data flow information will appear once token usage is tracked." />
            )}
          </>
        )}
      </div>
    </div>
  );
}
