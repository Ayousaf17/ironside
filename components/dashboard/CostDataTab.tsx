'use client';

import { EmptyState } from '@/components/ui/empty-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CostDataTab({ data }: { data: any }) {
  if (!data) {
    return <EmptyState title="No Cost Data" description="Cost and data flow information will appear once token usage is tracked." />;
  }
  return <EmptyState title="Cost & Data" description="Tab under construction." />;
}
