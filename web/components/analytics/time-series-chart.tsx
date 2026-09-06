"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";

function formatPeriod(period: string) {
  return new Date(`${period}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface Series {
  dataKey: string;
  color: string;
  name: string;
}

export function TimeSeriesChart<T extends { period: string }>({
  title,
  data,
  series,
  type = "bar",
  stacked = false,
  height = 220,
  valueFormatter,
}: {
  title: string;
  data: T[];
  series: Series[];
  type?: "bar" | "line";
  stacked?: boolean;
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const hasData = data.some((row) =>
    series.some((s) => Number((row as Record<string, unknown>)[s.dataKey]) > 0)
  );

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{title}</p>
        {!hasData ? (
          <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
            No activity in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            {type === "bar" ? (
              <BarChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="period"
                  tickFormatter={formatPeriod}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  labelFormatter={(label) => formatPeriod(String(label))}
                  formatter={(value, name) => [
                    valueFormatter ? valueFormatter(Number(value)) : value,
                    name,
                  ]}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {series.map((s) => (
                  <Bar
                    key={s.dataKey}
                    dataKey={s.dataKey}
                    name={s.name}
                    fill={s.color}
                    stackId={stacked ? "stack" : undefined}
                    radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="period"
                  tickFormatter={formatPeriod}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  labelFormatter={(label) => formatPeriod(String(label))}
                  formatter={(value, name) => [
                    valueFormatter ? valueFormatter(Number(value)) : value,
                    name,
                  ]}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {series.map((s) => (
                  <Line
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
