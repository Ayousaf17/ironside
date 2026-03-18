'use client';

import type { PulseCheck } from '@/types/pulse';

interface OpsNotesProps {
  notes: string[];
  timestamp: string;
  pulse?: PulseCheck;
}

function getSeverity(note: string): 'critical' | 'warning' | 'info' {
  const upper = note.toUpperCase();
  if (upper.includes('CRITICAL')) return 'critical';
  if (
    upper.includes('WARNING') ||
    upper.includes('CAUTION') ||
    upper.includes('CONCERN') ||
    upper.includes('ATTENTION') ||
    upper.includes('ISSUE') ||
    upper.includes('PROBLEM')
  )
    return 'warning';
  return 'info';
}

const severityStyles = {
  critical: 'border-l-red-500 bg-red-50/50',
  warning: 'border-l-amber-500 bg-amber-50/50',
  info: 'border-l-green-500 bg-green-50/50',
};

export default function OpsNotes({ notes, timestamp, pulse }: OpsNotesProps) {
  const formattedDate = timestamp
    ? new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  // Computed reality check values
  let trueUnassigned = 0;
  let spamCount = 0;
  let realTickets = 0;
  let hasRealityData = false;

  if (pulse) {
    spamCount = Math.round((pulse.spam_pct / 100) * pulse.ticket_count);
    realTickets = pulse.ticket_count - spamCount;
    const rawUnassigned = pulse.workload['Unassigned'] ?? 0;
    const autoCloseCount = pulse.tags['auto-close'] ?? 0;
    trueUnassigned = Math.max(0, rawUnassigned - autoCloseCount);
    hasRealityData = pulse.ticket_count > 0;
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Latest Ops Notes</h3>
        {formattedDate && (
          <p className="text-xs text-gray-500">From pulse check on {formattedDate}</p>
        )}
      </div>

      {/* Computed Reality Check — shown before AI-generated notes */}
      {hasRealityData && pulse && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs font-semibold text-blue-800 mb-1.5 uppercase tracking-wide">
            Reality Check 🔍
          </p>
          <div className="space-y-1 text-sm text-blue-900">
            <p>
              <span className="font-semibold">True queue:</span> {trueUnassigned} ticket
              {trueUnassigned !== 1 ? 's' : ''} actually waiting for a human.
              {pulse.unassigned_pct > 40 && (
                <span className="text-blue-600 font-normal">
                  {' '}The {pulse.unassigned_pct.toFixed(0)}% figure? Spam inflating its own importance again.
                </span>
              )}
            </p>
            <p>
              <span className="font-semibold">Real support load:</span> {realTickets} of{' '}
              {pulse.ticket_count} tickets.{' '}
              <span className="text-blue-600 font-normal">
                ({spamCount} were spam — already handled. The robots earned their keep.)
              </span>
            </p>
          </div>
        </div>
      )}

      {(!notes || notes.length === 0) ? (
        <div className="text-sm text-gray-400">No ops notes available</div>
      ) : (
        <div className="space-y-3 max-h-[260px] overflow-y-auto">
          {notes.map((note, i) => {
            const severity = getSeverity(note);
            return (
              <div
                key={i}
                className={`border-l-4 rounded-r-lg p-3 text-sm text-gray-700 ${severityStyles[severity]}`}
              >
                {note}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
