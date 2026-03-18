'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface TopCategoriesProps {
  data: { question: string; count: number; ticket_ids: number[] }[];
  previousData?: { question: string; count: number; ticket_ids: number[] }[];
}

export default function TopCategories({ data, previousData }: TopCategoriesProps) {
  const prevMap = new Map<string, number>(
    (previousData || []).map((item) => [item.question, item.count])
  );

  const chartData = (data || [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((item) => {
      const prevCount = prevMap.get(item.question);
      const delta = prevCount !== undefined ? item.count - prevCount : null;
      const isPersistent =
        previousData !== undefined &&
        prevCount !== undefined &&
        item.count >= 10 &&
        prevCount >= 10;
      const isGrowing = isPersistent && delta !== null && delta > 0;

      let deltaLabel = '';
      if (delta !== null) {
        if (delta > 0) deltaLabel = `↑+${delta}`;
        else if (delta < 0) deltaLabel = `↓${delta}`;
        else deltaLabel = '→0';
      }

      return {
        name: item.question.length > 28 ? item.question.slice(0, 25) + '...' : item.question,
        fullName: item.question,
        count: item.count,
        delta,
        deltaLabel,
        isPersistent,
        isGrowing,
      };
    });

  // Find top persistent categories for warning banner
  const persistentCategories = chartData.filter((d) => d.isPersistent);
  const growingPersistent = persistentCategories.filter((d) => d.isGrowing);

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Top Ticket Categories</h3>
        <p className="text-xs text-gray-500">
          Most frequent question types from latest pulse
          {previousData ? ' — with WoW change' : ''}
        </p>
      </div>

      {/* Persistent category warning banner */}
      {growingPersistent.length > 0 && (
        <div className="mb-4 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
          <p className="text-xs font-semibold text-orange-800">
            Persistent &amp; growing:{' '}
            {growingPersistent
              .slice(0, 2)
              .map((d) => d.fullName)
              .join(', ')}{' '}
            — present across both pulses with increasing volume
          </p>
        </div>
      )}

      {chartData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">
          No category data available
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 5, right: 70, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={155}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
                formatter={(value: number, _name, props) => {
                  const d = props.payload;
                  const deltaStr = d.deltaLabel ? ` (${d.deltaLabel} WoW)` : '';
                  return [`${value} tickets${deltaStr}`];
                }}
                labelFormatter={(label: string, payload) => {
                  if (payload && payload.length > 0) {
                    return payload[0].payload.fullName;
                  }
                  return label;
                }}
              />
              <Bar
                dataKey="count"
                name="Tickets"
                radius={[0, 4, 4, 0]}
                barSize={24}
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.isGrowing ? '#f97316' : entry.isPersistent ? '#fb923c' : '#3b82f6'}
                  />
                ))}
                {previousData && (
                  <LabelList
                    dataKey="deltaLabel"
                    position="right"
                    style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                  />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend for persistent categories */}
      {previousData && persistentCategories.length > 0 && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-orange-400" />
            Persistent (&ge;10 tickets in both pulses)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
            Standard
          </span>
        </div>
      )}
    </div>
  );
}
