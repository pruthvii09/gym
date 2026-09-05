"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { apiWeekdayToJsDay } from "@/lib/rest-day";
import type { CalendarDay } from "@/types/api";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
// Fallback label for the rest-day row specifically, since WEEKDAY_LABELS
// otherwise leaves Sun/Tue/Thu/Sat blank (GitHub-style sparse labeling).
const WEEKDAY_LABELS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Cell = { day: CalendarDay | null; isToday: boolean };

function formatTooltip(day: CalendarDay) {
  const date = new Date(`${day.date}T00:00:00`);
  const label = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (!day.checked_in) return `No check-in — ${label}`;
  return `Checked in — ${label}`;
}

export function StreakCalendar({
  days,
  restDayOfWeek = null,
}: {
  days: CalendarDay[];
  restDayOfWeek?: number | null;
}) {
  // Row index within a column is the JS Date.getDay() value (0=Sun..6=Sat)
  // -- leadingBlanks below aligns the first column to it, and every column
  // has exactly 7 rows -- so this converts the API's rest-day convention
  // once, to know which row to mark.
  const restDayRow = restDayOfWeek !== null ? apiWeekdayToJsDay(restDayOfWeek) : null;

  const { columns, monthLabels } = useMemo(() => {
    if (days.length === 0) return { columns: [] as Cell[][], monthLabels: [] as { index: number; label: string }[] };

    const todayIso = new Date().toISOString().slice(0, 10);
    const firstDate = new Date(`${days[0].date}T00:00:00`);
    const leadingBlanks = firstDate.getDay(); // 0 (Sun) .. 6 (Sat)

    const flat: Cell[] = [
      ...Array.from({ length: leadingBlanks }, () => ({ day: null, isToday: false })),
      ...days.map((day) => ({ day, isToday: day.date === todayIso })),
    ];

    const cols: Cell[][] = [];
    for (let i = 0; i < flat.length; i += 7) {
      cols.push(flat.slice(i, i + 7));
    }

    const labels: { index: number; label: string }[] = [];
    let lastMonth = -1;
    cols.forEach((col, index) => {
      const firstReal = col.find((c) => c.day)?.day;
      if (!firstReal) return;
      const month = new Date(`${firstReal.date}T00:00:00`).getMonth();
      if (month !== lastMonth) {
        labels.push({ index, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    });

    return { columns: cols, monthLabels: labels };
  }, [days]);

  if (columns.length === 0) return null;

  const cellPx = 11;
  const gapPx = 3;
  const colWidth = cellPx + gapPx;

  return (
    <div className="min-w-0 overflow-x-auto pb-1">
      <div style={{ width: columns.length * colWidth + 24 }}>
        <div className="relative h-4" style={{ marginLeft: 24 }}>
          {monthLabels.map(({ index, label }) => (
            <span
              key={`${label}-${index}`}
              className="absolute top-0 text-[10px] text-muted-foreground"
              style={{ left: index * colWidth }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex flex-col gap-[3px]" style={{ width: 20 }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={i}
                title={i === restDayRow ? `${WEEKDAY_LABELS_FULL[i]} — your rest day` : undefined}
                className={cn(
                  "text-[9px] leading-none",
                  i === restDayRow ? "font-medium text-primary" : "text-muted-foreground"
                )}
                style={{ height: cellPx }}
              >
                {label || (i === restDayRow ? WEEKDAY_LABELS_FULL[i] : "")}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {columns.map((col, colIndex) => (
              <div key={colIndex} className="flex flex-col gap-[3px]">
                {col.map((cell, rowIndex) =>
                  cell.day ? (
                    <div
                      key={rowIndex}
                      title={formatTooltip(cell.day)}
                      className={cn(
                        "rounded-[2px] transition-transform hover:scale-125",
                        cell.day.checked_in
                          ? "bg-gradient-brand"
                          : rowIndex === restDayRow
                            ? "bg-primary/15"
                            : "bg-muted",
                        cell.isToday && "ring-1 ring-primary ring-offset-1 ring-offset-background"
                      )}
                      style={{ width: cellPx, height: cellPx }}
                    />
                  ) : (
                    <div key={rowIndex} style={{ width: cellPx, height: cellPx }} />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
