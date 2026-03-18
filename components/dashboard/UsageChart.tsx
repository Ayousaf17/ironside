"use client";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function UsageChart({ data }: { data: any[] }) {
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Daily Sessions & Cost</CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date_bucket" tickLine={false} axisLine={false} tickMargin={10} />
            <YAxis yAxisId="left" tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`}/>
            <Tooltip 
              contentStyle={{ background: "#111", border: "none", color: "#fff" }}
              cursor={{fill: 'transparent'}}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="session_count" fill="#3b82f6" name="Sessions" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="total_cost" fill="#10b981" name="Cost ($)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}