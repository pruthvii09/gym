"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, TrendingUp, UserCheck, Users } from "lucide-react";

import { StatCard } from "@/components/analytics/stat-card";
import { RangeSelector } from "@/components/analytics/range-selector";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";
import { DonutChart } from "@/components/analytics/donut-chart";
import { CheckinHeatmap } from "@/components/analytics/checkin-heatmap";
import { getGymAnalytics } from "@/lib/api/analytics";
import { useGymManageContext } from "../gym-manage-context";
import type { AnalyticsRange, GymAnalytics } from "@/types/api";

export default function GymAnalyticsPage() {
  const { gymId } = useGymManageContext();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<GymAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setData(null);
      getGymAnalytics(gymId, range)
        .then(setData)
        .catch(() => {
          setData(null);
          setError("Couldn't load analytics. Refresh to try again.");
        });
    }, 0);
    return () => clearTimeout(timeout);
  }, [gymId, range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-muted-foreground">How this gym is doing, at a glance.</p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={Users} value={data.stats.total_members} label="Total members" />
            <StatCard
              icon={UserCheck}
              value={data.stats.active_members_this_week}
              label="Active this week"
              tone="success"
            />
            <StatCard
              icon={TrendingUp}
              value={data.stats.average_current_streak}
              label="Avg. current streak"
              tone="warning"
            />
            <StatCard
              icon={CalendarCheck}
              value={data.stats.checkins_this_month}
              label="Check-ins this month"
            />
          </div>

          <TimeSeriesChart
            title="Check-ins over time"
            data={data.checkins_over_time}
            series={[{ dataKey: "count", color: "var(--chart-1)", name: "Check-ins" }]}
          />

          <TimeSeriesChart
            title="Member growth"
            data={data.member_growth}
            series={[{ dataKey: "count", color: "var(--chart-2)", name: "Members" }]}
            type="line"
          />

          <DonutChart
            title="Active vs. inactive this week"
            data={[
              { label: "Active", value: data.stats.active_members_this_week, color: "var(--chart-4)" },
              { label: "Inactive", value: data.stats.inactive_members_this_week, color: "var(--chart-5)" },
            ]}
          />

          <CheckinHeatmap cells={data.checkin_heatmap} />

          <TimeSeriesChart
            title="Rewards earned by members"
            data={data.rewards_earned_over_time}
            series={[{ dataKey: "count", color: "var(--chart-3)", name: "Rewards" }]}
          />
        </>
      )}
    </div>
  );
}
