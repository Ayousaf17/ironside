'use client';

export interface FeedbackLoopData {
  overallAccuracy: number | null;
  totalJudged: number;
  totalCorrect: number;
  totalCorrected: number;
  matrix: { aiCategory: string; humanCategory: string; count: number }[];
  recentCorrections: {
    ticketId: number;
    aiCategory: string;
    humanCategory: string;
    correctedAt: string;
    correctedBy: string | null;
  }[];
  weeklyAccuracy: { week: string; accuracy: number | null; total: number; corrections: number }[];
  classifierInsights: { aiCategory: string; humanCategory: string; count: number; suggestion: string }[];
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

type AccentColor = 'blue' | 'emerald' | 'amber' | 'red' | 'gray';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: AccentColor;
}

const accentBarClass: Record<AccentColor, string> = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
};

function StatCard({ label, value, sub, accent = 'gray' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className={`w-8 h-1 rounded-full mb-3 ${accentBarClass[accent]}`} />
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accuracyAccent(accuracy: number | null): AccentColor {
  if (accuracy === null) return 'gray';
  if (accuracy >= 85) return 'emerald';
  if (accuracy >= 70) return 'amber';
  return 'red';
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ');
}

function formatShortDate(isoDate: string): string {
  // isoDate is "YYYY-MM-DD"
  const [year, month, day] = isoDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function formatCorrectedAt(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FeedbackLoopTab({ data }: { data: FeedbackLoopData | null }) {
  if (!data || data.totalJudged === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <p className="text-lg font-semibold text-gray-900 mb-2">No corrections yet.</p>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          As agents correct the AI&apos;s classifications using the &apos;Wrong category?&apos; button,
          the feedback will appear here.
        </p>
      </div>
    );
  }

  const {
    overallAccuracy,
    totalJudged,
    totalCorrected,
    matrix,
    recentCorrections,
    weeklyAccuracy,
    classifierInsights,
  } = data;

  // Max accuracy for bar chart scaling
  const maxBarAccuracy = 100;

  return (
    <div className="space-y-8">

      {/* ── A. Stat Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="AI Accuracy"
          value={overallAccuracy !== null ? `${overallAccuracy}%` : '—'}
          sub={`based on ${totalJudged.toLocaleString()} judged tickets`}
          accent={accuracyAccent(overallAccuracy)}
        />
        <StatCard
          label="Corrections Logged"
          value={totalCorrected.toLocaleString()}
          sub="times human disagreed with AI"
          accent="blue"
        />
        <StatCard
          label="Tickets Judged"
          value={totalJudged.toLocaleString()}
          sub="tickets with human feedback"
          accent="gray"
        />
      </div>

      {/* ── B. Weekly Accuracy Trend ──────────────────────────────────────── */}
      {weeklyAccuracy.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Weekly Accuracy Trend
          </h2>
          <div className="flex items-end gap-3 h-32">
            {weeklyAccuracy.map((w) => {
              const heightPct = w.accuracy !== null
                ? Math.max(4, (w.accuracy / maxBarAccuracy) * 100)
                : 4;
              const barColor = w.accuracy !== null
                ? w.accuracy >= 85 ? 'bg-emerald-400' : w.accuracy >= 70 ? 'bg-amber-400' : 'bg-red-400'
                : 'bg-gray-200';

              return (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  {/* Accuracy label above bar */}
                  <span className="text-xs font-medium text-gray-700 tabular-nums">
                    {w.accuracy !== null ? `${w.accuracy}%` : '—'}
                  </span>
                  {/* Bar */}
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className={`w-full rounded-t ${barColor} transition-all`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  {/* Week label */}
                  <span className="text-xs text-gray-500 truncate w-full text-center">
                    {formatShortDate(w.week)}
                  </span>
                  {/* Corrections count */}
                  {w.corrections > 0 && (
                    <span className="text-xs text-gray-400">
                      {w.corrections} fix{w.corrections !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── C. Misclassification Matrix ───────────────────────────────────── */}
      {matrix.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Where the AI goes wrong</h2>
            <p className="text-xs text-gray-500 mt-0.5">Top misclassification pairs by frequency</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left font-medium">AI Classified As</th>
                <th className="px-5 py-3 text-left font-medium">Human Corrected To</th>
                <th className="px-5 py-3 text-center font-medium">Times</th>
                <th className="px-5 py-3 text-center font-medium">% of corrections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matrix.map((row, i) => {
                const pct = totalCorrected > 0
                  ? Math.round((row.count / totalCorrected) * 1000) / 10
                  : 0;
                const badgeColor = row.count >= 5
                  ? 'bg-red-100 text-red-700'
                  : row.count >= 2
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600';

                return (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-800 font-mono text-xs">
                      {formatCategory(row.aiCategory)}
                    </td>
                    <td className="px-5 py-3 text-gray-800 font-mono text-xs">
                      {formatCategory(row.humanCategory)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>
                        {row.count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-gray-500 tabular-nums text-xs">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── D. Classifier Insights ────────────────────────────────────────── */}
      {classifierInsights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Suggested classifier improvements
          </h2>
          {classifierInsights.map((insight, i) => (
            <div
              key={i}
              className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900"
            >
              {insight.suggestion}
            </div>
          ))}
        </div>
      )}

      {/* ── E. Recent Corrections Feed ────────────────────────────────────── */}
      {recentCorrections.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Corrections</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last {recentCorrections.length} AI category corrections</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentCorrections.map((r) => (
              <li key={r.ticketId} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <span className="text-xs font-mono text-gray-400 shrink-0">
                  #{r.ticketId}
                </span>
                <span className="flex-1 text-sm text-gray-700 min-w-0">
                  <span className="text-red-600 font-medium">{formatCategory(r.aiCategory)}</span>
                  <span className="text-gray-400 mx-2">→</span>
                  <span className="text-emerald-600 font-medium">{formatCategory(r.humanCategory)}</span>
                </span>
                {r.correctedBy && (
                  <span className="text-xs text-gray-500 shrink-0">{r.correctedBy}</span>
                )}
                <span className="text-xs text-gray-400 shrink-0">
                  {formatCorrectedAt(r.correctedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
