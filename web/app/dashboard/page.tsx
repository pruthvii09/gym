"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Dumbbell,
  Flame,
  LogOut,
  Plus,
  QrCode,
  ShieldCheck,
  Users,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StreakOverviewCard } from "@/components/dashboard/streak-overview-card";
import { CheckinActivityCard } from "@/components/dashboard/checkin-activity-card";
import { RecentCheckinsCard } from "@/components/dashboard/recent-checkins-card";
import { RewardsCard } from "@/components/dashboard/rewards-card";
import { RestDayCard } from "@/components/dashboard/rest-day-card";
import { ActiveWorkoutBanner } from "@/components/dashboard/active-workout-banner";
import { logout as logoutRequest } from "@/lib/api/auth";
import { listMyGymMemberships } from "@/lib/api/gyms";
import { getMyCalendar, getMyRestDay } from "@/lib/api/streaks";
import { clearTokens, getRefreshToken } from "@/lib/auth/session";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { toUtcIsoDate } from "@/lib/utils";
import type { CalendarResponse, GymMembershipSummary, GymStatus, MeResponse, UserRestDay } from "@/types/api";

// Active gyms first (the ones you'd actually jump into day to day), then
// pending (still needs admin review), then everything else.
const STATUS_SORT_ORDER: Record<GymStatus, number> = {
  active: 0,
  pending: 1,
  rejected: 2,
  inactive: 3,
};

const CALENDAR_DAYS = 364; // 52 weeks -- the classic GitHub-graph span
const DAY_MS = 24 * 60 * 60 * 1000;

function MemberDashboard({ me, displayName }: { me: MeResponse; displayName: string }) {
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [restDay, setRestDay] = useState<UserRestDay | null>(null);

  // Shared by StreakOverviewCard (at-risk banner) and CheckinActivityCard
  // (calendar row marker) -- fetched once here rather than by each card,
  // unlike the other cards below which are fully self-contained. Computed
  // via absolute-time subtraction + toUtcIsoDate (not setDate + local
  // getters) so the requested range's day boundaries match the backend's
  // UTC ones, not the viewer's local calendar.
  const loadShared = () => {
    const end = new Date();
    const start = new Date(end.getTime() - (CALENDAR_DAYS - 1) * DAY_MS);
    getMyCalendar(toUtcIsoDate(start), toUtcIsoDate(end))
      .then(setCalendar)
      .catch(() => setCalendar(null));
    getMyRestDay()
      .then(setRestDay)
      .catch(() => setRestDay(null));
  };

  useEffect(() => {
    loadShared();
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            Welcome back, {displayName}.
          </h1>
          <p className="mt-1 text-muted-foreground">
            {me.gym ? me.gym.name : "No home gym yet"}
          </p>
        </div>
        {/* min-w-0 (not shrink-0) so this group can give up width to wrap
            its own buttons onto a second line instead of forcing the whole
            row past the viewport -- shrink-0 blocked that by pinning the
            div at its unwrapped max-content width. The primary "Scan to
            check in" CTA is pulled out into its own full-width button below
            on mobile (hidden sm:inline-flex here) since it's the one action
            worth a phone user's thumb, not another same-sized pill. */}
        <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0">
          <Button variant="outline" render={<Link href="/analytics" />}>
            <BarChart3 />
            Analytics
          </Button>
          <Button variant="outline" render={<Link href="/feed" />}>
            <Users />
            Feed
          </Button>
          {me.gym ? (
            <>
              <Button variant="outline" render={<Link href="/workouts" />}>
                <Dumbbell />
                Workouts
              </Button>
              <Button
                variant="gradient"
                className="hidden sm:inline-flex"
                render={<Link href="/checkin" />}
              >
                <QrCode />
                Scan to check in
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {me.gym ? (
        <Button variant="gradient" className="w-full sm:hidden" render={<Link href="/checkin" />}>
          <QrCode />
          Scan to check in
        </Button>
      ) : null}

      <ActiveWorkoutBanner />

      <StreakOverviewCard calendar={calendar} restDay={restDay} hasGym={!!me.gym} />

      <CheckinActivityCard calendar={calendar} restDayOfWeek={restDay?.day_of_week ?? null} />

      <RestDayCard onChanged={loadShared} />

      <RecentCheckinsCard />

      <RewardsCard />
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user: me, loading } = useCurrentUser();
  const [memberships, setMemberships] = useState<GymMembershipSummary[] | null>(null);

  // Anyone who staffs at least one gym has no business on this holding page --
  // they land straight in the gym they manage (highest-priority one first),
  // and the sidebar's org switcher takes it from there.
  const staffMemberships = useMemo(
    () =>
      memberships
        ? memberships
            .filter((m) => m.role !== "member")
            .sort(
              (a, b) =>
                STATUS_SORT_ORDER[a.gym.status] - STATUS_SORT_ORDER[b.gym.status] ||
                a.gym.name.localeCompare(b.gym.name)
            )
        : null,
    [memberships]
  );

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (!me) return;
    listMyGymMemberships()
      .then((res) => setMemberships(res.results))
      .catch(() => setMemberships([]));
  }, [me]);

  useEffect(() => {
    if (staffMemberships && staffMemberships.length > 0) {
      router.replace(`/gyms/${staffMemberships[0].gym.id}/manage`);
    }
  }, [staffMemberships, router]);

  const handleLogout = async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await logoutRequest(refresh);
      } catch {
        // token may already be expired/blacklisted -- clear local state regardless
      }
    }
    clearTokens();
    router.push("/login");
  };

  const resolving = loading || !me || staffMemberships === null || staffMemberships.length > 0;

  if (resolving) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const displayName = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
              <Flame className="size-3.5" />
            </span>
            GymStreak
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" render={<Link href="/profile" />}>
              <UserRound />
              Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-6 px-6 py-12 sm:px-8">
        <MemberDashboard me={me} displayName={displayName} />

        {me.is_staff ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Platform admin</p>
                <p className="text-sm text-muted-foreground">
                  Review gym approvals and manage members across GymStreak.
                </p>
              </div>
              <Button variant="outline" size="sm" render={<Link href="/admin" />}>
                <ShieldCheck />
                Admin panel
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Own or run a gym?</p>
              <p className="text-sm text-muted-foreground">
                You don&apos;t manage any gyms yet — create one to get started.
              </p>
            </div>
            <Button variant="outline" size="sm" render={<Link href="/gyms/new" />}>
              <Plus />
              Create a gym
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
