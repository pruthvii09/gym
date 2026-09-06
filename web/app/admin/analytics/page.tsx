"use client";

import { useEffect, useState } from "react";
import { Building2, MapPin, ShieldAlert, UserPlus, Users } from "lucide-react";

import { StatCard } from "@/components/analytics/stat-card";
import { RangeSelector } from "@/components/analytics/range-selector";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";
import { DistributionBarChart } from "@/components/analytics/distribution-bar-chart";
import { getPlatformAnalytics } from "@/lib/api/analytics";
import type { AnalyticsRange, PlatformAnalytics } from "@/types/api";

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setData(null);
      getPlatformAnalytics(range)
        .then(setData)
        .catch(() => {
          setData(null);
          setError("Couldn't load analytics. Refresh to try again.");
        });
    }, 0);
    return () => clearTimeout(timeout);
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform analytics</h1>
          <p className="mt-1 text-muted-foreground">Activity, growth, and risk across GymStreak.</p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard icon={Users} value={data.stats.total_users} label="Total users" />
            <StatCard icon={Building2} value={data.stats.total_gyms} label="Active gyms" />
            <StatCard
              icon={UserPlus}
              value={data.stats.pending_gyms}
              label="Gyms pending review"
              tone="warning"
            />
            <StatCard icon={MapPin} value={data.stats.total_checkins_all_time} label="Check-ins all-time" />
            <StatCard
              icon={ShieldAlert}
              value={data.stats.open_fraud_reviews}
              label="Open fraud reviews"
              tone="destructive"
            />
            <StatCard
              icon={Users}
              value={data.stats.total_workouts_logged}
              label="Workouts logged"
            />
          </div>

          <TimeSeriesChart
            title="Check-ins over time"
            data={data.checkins_over_time}
            series={[{ dataKey: "count", color: "var(--chart-1)", name: "Check-ins" }]}
          />

          <TimeSeriesChart
            title="Signups over time"
            data={data.signups_over_time}
            series={[{ dataKey: "count", color: "var(--chart-2)", name: "Signups" }]}
          />

          <DistributionBarChart
            title="Streak distribution"
            data={data.streak_distribution}
            labelKey="bucket"
            valueKey="count"
            color="var(--chart-4)"
            emptyMessage="No streak data yet."
          />

          <TimeSeriesChart
            title="Fraud reviews over time"
            data={data.fraud_reviews_over_time}
            series={[
              { dataKey: "open", color: "var(--chart-5)", name: "Open" },
              { dataKey: "approved", color: "var(--destructive)", name: "Confirmed" },
              { dataKey: "rejected", color: "var(--chart-3)", name: "Dismissed" },
            ]}
            stacked
          />

          <DistributionBarChart
            title="Top gyms by check-ins"
            data={data.top_gyms_by_checkins}
            labelKey="gym_name"
            valueKey="count"
            color="var(--chart-1)"
            emptyMessage="No check-ins in this range."
          />
        </>
      )}
    </div>
  );
}
