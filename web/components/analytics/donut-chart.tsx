"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent } from "@/components/ui/card";

export function DonutChart({
  title,
  data,
  height = 180,
}: {
  title: string;
  data: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{title}</p>
        {total === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            No data yet.
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={height} height={height}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((d) => (
                    <Cell key={d.label} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-1.5 text-sm">
              {data.map((d) => (
                <li key={d.label} className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-medium">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
