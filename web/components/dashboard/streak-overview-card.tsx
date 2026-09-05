"use client";

import Link from "next/link";
import { Flame, Trophy } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { todayApiWeekday } from "@/lib/rest-day";
import { toUtcIsoDate } from "@/lib/utils";
import type { CalendarResponse, UserRestDay } from "@/types/api";

export function StreakOverviewCard({
  calendar,
  restDay,
  hasGym,
}: {
  calendar: CalendarResponse | null;
  restDay: UserRestDay | null;
  hasGym: boolean;
}) {
  const streak = calendar?.streak;
  const isPersonalBest =
    !!streak && streak.current_streak > 0 && streak.current_streak === streak.longest_streak;
  // last_activity_date is the same gym-day (grace-period-aware) value the
  // streak calculation itself uses, so this is the most accurate "have they
  // already banked today" signal available without a dedicated endpoint --
  // compared via toUtcIsoDate (not a browser-local date string) since the
  // backend computes it entirely in UTC.
  const checkedInToday = !!streak && streak.last_activity_date === toUtcIsoDate(new Date());
  const isRestDayToday = restDay?.day_of_week === todayApiWeekday();
  const streakAtRisk = !!streak && streak.current_streak > 0 && !checkedInToday && !isRestDayToday;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Flame className="size-5" />
            </span>
            <div>
              <p className="text-2xl leading-none font-semibold">
                {streak ? streak.current_streak : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Current streak</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Trophy className="size-5" />
            </span>
            <div>
              <p className="text-2xl leading-none font-semibold">
                {streak ? streak.longest_streak : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Longest streak</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {streakAtRisk ? (
        <Alert className="-mt-2 border-warning/25 bg-warning/5 text-warning">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-current">
            <span className="flex items-center gap-1.5">
              <Flame className="size-4" />
              You haven&apos;t checked in today — keep your {streak!.current_streak}-day streak
              alive.
            </span>
            {hasGym ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-warning/30 text-warning hover:bg-warning/10"
                render={<Link href="/checkin" />}
              >
                Check in now
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : streak && streak.current_streak > 0 ? (
        <p className="-mt-2 text-sm text-muted-foreground">
          {isPersonalBest
            ? `🔥 ${streak.current_streak} days — that's your personal best!`
            : isRestDayToday && !checkedInToday
              ? `🔥 ${streak.current_streak} day streak — today's your rest day, no gym needed.`
              : `🔥 Checked in today — ${streak.current_streak} day streak and counting.`}
        </p>
      ) : null}
    </>
  );
}
