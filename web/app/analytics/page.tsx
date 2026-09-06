"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Dumbbell, Flame, MapPin, Trophy } from "lucide-react";

import { StatCard } from "@/components/analytics/stat-card";
import { RangeSelector } from "@/components/analytics/range-selector";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";
import { MuscleIntensityDiagram } from "@/components/workouts/muscle-body-diagram";
import { Card, CardContent } from "@/components/ui/card";
import { getMyAnalytics } from "@/lib/api/analytics";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { AnalyticsRange, MemberAnalytics } from "@/types/api";

export default function MemberAnalyticsPage() {
  const router = useRouter();
  const { user: me, loading: userLoading } = useCurrentUser();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<MemberAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const timeout = setTimeout(() => {
      setData(null);
      getMyAnalytics(range)
        .then(setData)
        .catch(() => {
          setData(null);
          setError("Couldn't load your analytics. Refresh to try again.");
        });
    }, 0);
    return () => clearTimeout(timeout);
  }, [me, range]);

  useEffect(() => {
    if (!userLoading && !me) router.replace(`/login?next=${encodeURIComponent("/analytics")}`);
  }, [userLoading, me, router]);

  if (userLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const muscleCounts = Object.fromEntries(
    (data?.muscle_set_counts ?? []).map((m) => [m.muscle, m.sets])
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your analytics</h1>
            <p className="mt-1 text-muted-foreground">Check-ins, workouts, and rewards over time.</p>
          </div>
          <RangeSelector value={range} onChange={setRange} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Flame} value={data.stats.current_streak} label="Current streak" />
              <StatCard icon={Trophy} value={data.stats.longest_streak} label="Longest streak" tone="warning" />
              <StatCard icon={MapPin} value={data.stats.total_checkins} label="Total check-ins" />
              <StatCard icon={Dumbbell} value={data.stats.total_workouts} label="Workouts logged" />
            </div>

            {data.stats.favorite_gym_name ? (
              <Card>
                <CardContent className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{data.stats.favorite_gym_name}</p>
                    <p className="text-xs text-muted-foreground">Your most-visited gym</p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <TimeSeriesChart
              title="Check-ins over time"
              data={data.checkins_over_time}
              series={[{ dataKey: "count", color: "var(--chart-1)", name: "Check-ins" }]}
            />

            <TimeSeriesChart
              title="Sets logged over time"
              data={data.workout_volume_over_time}
              series={[{ dataKey: "sets", color: "var(--chart-2)", name: "Sets" }]}
            />

            <TimeSeriesChart
              title="Weight lifted over time"
              data={data.workout_volume_over_time}
              series={[{ dataKey: "total_weight_kg", color: "var(--chart-3)", name: "kg" }]}
              type="line"
              valueFormatter={(v) => `${v} kg`}
            />

            <Card>
              <CardContent className="space-y-1">
                <p className="text-sm font-medium">Muscles trained</p>
                <p className="text-xs text-muted-foreground">
                  Based on {data.stats.total_sets} logged set{data.stats.total_sets === 1 ? "" : "s"}
                </p>
                {Object.keys(muscleCounts).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Log a workout to see this fill in.
                  </p>
                ) : (
                  <MuscleIntensityDiagram muscleCounts={muscleCounts} height={220} />
                )}
              </CardContent>
            </Card>

            <TimeSeriesChart
              title="Rewards earned over time"
              data={data.rewards_earned_over_time}
              series={[{ dataKey: "count", color: "var(--chart-4)", name: "Rewards" }]}
            />
          </>
        )}
      </main>
    </div>
  );
}
