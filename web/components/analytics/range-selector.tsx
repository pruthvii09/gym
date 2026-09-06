"use client";

import { cn } from "@/lib/utils";
import type { AnalyticsRange } from "@/types/api";

const OPTIONS: { label: string; value: AnalyticsRange }[] = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "All time", value: "all" },
];

export function RangeSelector({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
