'use client';

import { EmptyState } from '@/components/ui/empty-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AgentIntelligenceTab({ data }: { data: any }) {
  if (!data) {
    return <EmptyState title="No Agent Data" description="Agent intelligence data will appear once behavior logs start flowing." />;
  }
  return <EmptyState title="Agent Intelligence" description="Tab under construction." />;
}
