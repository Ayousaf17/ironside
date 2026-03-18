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

interface ResolutionChartProps {
  data: PulseCheck[];
}

export default function ResolutionChart({ data }: ResolutionChartProps) {
  const chartData = data
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((p) => ({
      date: new Date(p.date_range_end).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      avg: Math.round(p.resolution_avg_min),
      p50: Math.round(p.resolution_p50_min),
      p90: Math.round(p.resolution_p90_min),
    }));

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Resolution Times</h3>
        <p className="text-xs text-gray-500">Avg, P50, P90 over time</p>
      </div>
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
              unit=" min"
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number) => [`${value} min`]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="avg"
              name="Avg"
              stroke="#93c5fd"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="P50"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="p90"
              name="P90"
              stroke="#1e3a5f"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
