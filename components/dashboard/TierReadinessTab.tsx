'use client';

import { EmptyState } from '@/components/ui/empty-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function TierReadinessTab({ data }: { data: any }) {
  if (!data) {
    return <EmptyState title="No Tier Data" description="Tier readiness data will appear once AI classification runs accumulate." />;
  }
  return <EmptyState title="Tier Readiness" description="Tab under construction." />;
}
