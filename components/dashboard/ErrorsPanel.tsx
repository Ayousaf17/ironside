'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorEntry {
  type: string;
  count: number;
  latestAt: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ErrorsPanel() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);

  useEffect(() => {
    fetch('/api/dashboard/errors')
      .then((r) => r.json())
      .then((data: { errors: ErrorEntry[] }) => setErrors(data.errors ?? []))
      .catch(() => {});
  }, []);

  if (errors.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-900">Recent Errors (24h)</h3>
      </div>
      <div className="space-y-2">
        {errors.map((err) => (
          <div
            key={err.type}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-slate-700 font-mono text-xs truncate max-w-[60%]">
              {err.type}
            </span>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{err.count}x</span>
              <span>{relativeTime(err.latestAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
