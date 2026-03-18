'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { PulseCheck } from '@/types/pulse';

interface P90TrendChartProps {
  data: PulseCheck[];
}

export default function P90TrendChart({ data }: P90TrendChartProps) {
  const sorted = data
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const chartData = sorted.map((p) => ({
    date: new Date(p.date_range_end).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    p90: Math.round(p.resolution_p90_min),
  }));

  // Determine max Y value to ensure SLA line is visible
  const maxP90 = Math.max(...chartData.map((d) => d.p90), 0);
  const yMax = Math.max(maxP90 * 1.1, 1600); // At least 1600 to show the 1440 SLA line

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">P90 Resolution Trend</h3>
        <p className="text-xs text-gray-500">90th percentile resolution time with 24hr SLA</p>
      </div>
      {chartData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
          No P90 data available
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
                domain={[0, yMax]}
                unit=" min"
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
                formatter={(value: number) => [`${value} min`, 'P90']}
              />
              <ReferenceLine
                y={1440}
                stroke="#ef4444"
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: '24hr SLA (1440 min)',
                  position: 'insideTopRight',
                  fill: '#ef4444',
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="p90"
                name="P90"
                stroke="#1e3a5f"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#1e3a5f' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
