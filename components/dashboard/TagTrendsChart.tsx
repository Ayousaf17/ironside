'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { PulseCheck } from '@/types/pulse';

interface TagTrendsChartProps {
  data: PulseCheck[];
}

// Colorblind-friendly qualitative palette (Set2-inspired) — categories need distinct colors
const TAG_COLORS = [
  '#66c2a5', // teal
  '#fc8d62', // salmon
  '#8da0cb', // periwinkle
  '#e78ac3', // pink
  '#a6d854', // lime
];

export default function TagTrendsChart({ data }: TagTrendsChartProps) {
  // Sort chronologically
  const sorted = data
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Count total usage of each tag across all pulse checks to find top 5
  const tagTotals: Record<string, number> = {};
  sorted.forEach((p) => {
    if (p.tags) {
      Object.entries(p.tags).forEach(([tag, count]) => {
        tagTotals[tag] = (tagTotals[tag] || 0) + count;
      });
    }
  });

  const top5Tags = Object.entries(tagTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Build chart data
  const chartData = sorted.map((p) => {
    const entry: Record<string, string | number> = {
      date: new Date(p.date_range_end).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    };
    top5Tags.forEach((tag) => {
      entry[tag] = p.tags?.[tag] || 0;
    });
    return entry;
  });

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Tag Trends</h3>
        <p className="text-xs text-gray-500">Top 5 tags over time</p>
      </div>
      {chartData.length === 0 || top5Tags.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
          No tag data available
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
              <Legend />
              {top5Tags.map((tag, i) => (
                <Line
                  key={tag}
                  type="monotone"
                  dataKey={tag}
                  name={tag}
                  stroke={TAG_COLORS[i % TAG_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
