'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { PulseCheck } from '@/types/pulse';

interface WorkloadChartProps {
  data: PulseCheck[];
}

// Colorblind-friendly qualitative palette (Set2-inspired)
// Unassigned always grey; agents get distinct qualitative colors
const QUALITATIVE_PALETTE = [
  '#66c2a5', // teal
  '#fc8d62', // salmon
  '#8da0cb', // periwinkle
  '#e78ac3', // pink
  '#a6d854', // lime
  '#ffd92f', // gold
  '#e5c494', // tan
  '#b3b3b3', // grey (fallback)
];

const UNASSIGNED_COLOR = '#9ca3af'; // grey — always for unassigned

export default function WorkloadChart({ data }: WorkloadChartProps) {
  // Sort data chronologically
  const sorted = data
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Collect all unique agent names across all pulse checks
  const allAgents = new Set<string>();
  sorted.forEach((p) => {
    if (p.workload) {
      Object.keys(p.workload).forEach((agent) => allAgents.add(agent));
    }
  });

  // Put "Unassigned" last
  const agentList = Array.from(allAgents)
    .filter((a) => a !== 'Unassigned')
    .sort();
  if (allAgents.has('Unassigned')) {
    agentList.push('Unassigned');
  }

  // Build chart data
  const chartData = sorted.map((p) => {
    const entry: Record<string, string | number> = {
      date: new Date(p.date_range_end).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    };
    agentList.forEach((agent) => {
      entry[agent] = p.workload?.[agent] || 0;
    });
    return entry;
  });

  // Assign colors: grey for Unassigned, qualitative palette for agents (by index)
  const agentColorMap = new Map<string, string>();
  let colorIdx = 0;
  agentList.forEach((agent) => {
    if (agent === 'Unassigned') {
      agentColorMap.set(agent, UNASSIGNED_COLOR);
    } else {
      agentColorMap.set(agent, QUALITATIVE_PALETTE[colorIdx % QUALITATIVE_PALETTE.length]);
      colorIdx++;
    }
  });
  const getColor = (agent: string): string => agentColorMap.get(agent) || '#b3b3b3';

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Agent Workload Distribution</h3>
        <p className="text-xs text-gray-500">Ticket assignments per agent over time</p>
      </div>
      {chartData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
          No workload data available
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
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
                label={{
                  value: 'Tickets',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 12, fill: '#6b7280' },
                }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
              <Legend />
              {agentList.map((agent) => (
                <Bar
                  key={agent}
                  dataKey={agent}
                  stackId="workload"
                  fill={getColor(agent)}
                  radius={agentList.indexOf(agent) === 0 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
