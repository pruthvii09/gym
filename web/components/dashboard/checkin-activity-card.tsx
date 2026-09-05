"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StreakCalendar } from "@/components/streak-calendar";
import type { CalendarResponse } from "@/types/api";

export function CheckinActivityCard({
  calendar,
  restDayOfWeek,
}: {
  calendar: CalendarResponse | null;
  restDayOfWeek: number | null;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Check-in activity</p>
          <p className="text-xs text-muted-foreground">Last 52 weeks</p>
        </div>
        {calendar ? (
          <StreakCalendar days={calendar.days} restDayOfWeek={restDayOfWeek} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        )}
      </CardContent>
    </Card>
  );
}
