'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import type { PulseCheck } from '@/types/pulse';

interface RatesTrendChartProps {
  data: PulseCheck[];
}

export default function RatesTrendChart({ data }: RatesTrendChartProps) {
  const chartData = data
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((p) => ({
      date: new Date(p.date_range_end).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      spam: parseFloat(p.spam_pct.toFixed(1)),
      unassigned: parseFloat(p.unassigned_pct.toFixed(1)),
    }));

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Spam & Unassigned Rate</h3>
        <p className="text-xs text-gray-500">Key health indicators over time</p>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorSpam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorUnassigned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
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
              domain={[0, 100]}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number) => [`${value}%`]}
            />
            <Legend />
            <ReferenceLine
              y={40}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{
                value: 'Danger Zone (40%)',
                position: 'insideTopRight',
                fill: '#ef4444',
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey="spam"
              name="Spam %"
              stroke="#f97316"
              strokeWidth={2}
              fill="url(#colorSpam)"
            />
            <Area
              type="monotone"
              dataKey="unassigned"
              name="Unassigned %"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#colorUnassigned)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
