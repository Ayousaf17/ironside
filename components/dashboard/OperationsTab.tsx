'use client';

import { EmptyState } from '@/components/ui/empty-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function OperationsTab({ data }: { data: any }) {
  if (!data) {
    return <EmptyState title="No Data Yet" description="Operations data will appear once the first pulse check completes." />;
  }
  return <EmptyState title="Operations" description="Tab under construction." />;
}
