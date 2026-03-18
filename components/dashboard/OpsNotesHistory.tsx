'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PulseCheck } from '@/types/pulse';

interface OpsNotesHistoryProps {
  data: PulseCheck[];
}

function getSeverity(note: string): 'CRITICAL' | 'WARNING' | 'INFO' {
  const upper = note.toUpperCase();
  if (upper.includes('CRITICAL')) return 'CRITICAL';
  if (
    upper.includes('WARNING') ||
    upper.includes('**') ||
    upper.includes('CAUTION') ||
    upper.includes('CONCERN') ||
    upper.includes('ATTENTION') ||
    upper.includes('ISSUE') ||
    upper.includes('PROBLEM')
  )
    return 'WARNING';
  return 'INFO';
}

interface NoteEntry {
  date: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  note: string;
}

export default function OpsNotesHistory({ data }: OpsNotesHistoryProps) {
  // Sort data by created_at descending (most recent first)
  const sorted = data
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Flatten all notes from all pulse checks
  const allNotes: NoteEntry[] = [];
  sorted.forEach((p) => {
    if (p.ops_notes && p.ops_notes.length > 0) {
      const formattedDate = new Date(p.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      p.ops_notes.forEach((note) => {
        allNotes.push({
          date: formattedDate,
          severity: getSeverity(note),
          note,
        });
      });
    }
  });

  const severityBadge = (severity: 'CRITICAL' | 'WARNING' | 'INFO') => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
            CRITICAL
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
            WARNING
          </Badge>
        );
      case 'INFO':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
            INFO
          </Badge>
        );
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Ops Notes History</h3>
        <p className="text-xs text-gray-500">
          All operational notes across pulse checks, most recent first
        </p>
      </div>
      {allNotes.length === 0 ? (
        <div className="text-sm text-gray-400">No ops notes available</div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-100">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead className="w-[100px]">Severity</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allNotes.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm text-gray-600 font-medium">
                    {entry.date}
                  </TableCell>
                  <TableCell>{severityBadge(entry.severity)}</TableCell>
                  <TableCell className="text-sm text-gray-700 whitespace-normal max-w-[500px]">
                    {entry.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
