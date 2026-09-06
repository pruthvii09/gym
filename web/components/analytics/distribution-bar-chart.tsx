"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";

export function DistributionBarChart<T extends object>({
  title,
  data,
  labelKey,
  valueKey,
  color = "var(--chart-1)",
  emptyMessage = "No data yet.",
  height,
}: {
  title: string;
  data: T[];
  labelKey: keyof T & string;
  valueKey: keyof T & string;
  color?: string;
  emptyMessage?: string;
  height?: number;
}) {
  const resolvedHeight = height ?? Math.max(data.length * 36, 120);
  // Recharts' generic dataKey typing ties itself to the *inferred* element
  // type of `data` -- casting once here (not per dataKey prop) keeps the
  // public API's `keyof T` key-safety while sidestepping that inference
  // fighting a generic T it can't pin down from a component boundary.
  const chartData = data as unknown as Record<string, string | number>[];

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{title}</p>
        {data.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: 120 }}
          >
            {emptyMessage}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={resolvedHeight}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey={labelKey as string}
                width={110}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey={valueKey as string} fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
