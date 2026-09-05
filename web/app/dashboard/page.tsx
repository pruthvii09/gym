"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flame, LogOut, Plus, QrCode, ShieldCheck, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StreakCalendar } from "@/components/streak-calendar";
import { logout as logoutRequest } from "@/lib/api/auth";
import { listMyGymMemberships } from "@/lib/api/gyms";
import { getMyCalendar, listMyCheckins } from "@/lib/api/checkins";
import { clearTokens, getRefreshToken } from "@/lib/auth/session";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { CalendarResponse, CheckIn, GymMembershipSummary, GymStatus, MeResponse } from "@/types/api";

// Active gyms first (the ones you'd actually jump into day to day), then
// pending (still needs admin review), then everything else.
const STATUS_SORT_ORDER: Record<GymStatus, number> = {
  active: 0,
  pending: 1,
  rejected: 2,
  inactive: 3,
};

const CALENDAR_DAYS = 364; // 52 weeks -- the classic GitHub-graph span

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const CHECKIN_STATUS_TONE: Record<string, string> = {
  verified: "border-success/20 bg-success/10 text-success",
  review: "border-warning/25 bg-warning/5 text-warning",
  rejected: "border-destructive/20 bg-destructive/5 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MemberDashboard({ me, displayName }: { me: MeResponse; displayName: string }) {
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[] | null>(null);

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (CALENDAR_DAYS - 1));
    getMyCalendar(toIsoDate(start), toIsoDate(end))
      .then(setCalendar)
      .catch(() => setCalendar(null));
    listMyCheckins()
      .then((res) => setCheckins(res.results))
      .catch(() => setCheckins([]));
  }, []);

  const streak = calendar?.streak;
  const isPersonalBest =
    !!streak && streak.current_streak > 0 && streak.current_streak === streak.longest_streak;

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
        {me.gym ? (
          <Button variant="gradient" className="shrink-0" render={<Link href="/checkin" />}>
            <QrCode />
            Scan to check in
          </Button>
        ) : null}
      </div>

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

      {streak && streak.current_streak > 0 ? (
        <p className="-mt-2 text-sm text-muted-foreground">
          {isPersonalBest
            ? `🔥 ${streak.current_streak} days — that's your personal best!`
            : `🔥 ${streak.current_streak} day streak — keep it going.`}
        </p>
      ) : null}

      <Card className="min-w-0">
        <CardContent className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Check-in activity</p>
            <p className="text-xs text-muted-foreground">Last 52 weeks</p>
          </div>
          {calendar ? (
            <StreakCalendar days={calendar.days} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Recent check-ins</p>
          {checkins === null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : checkins.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No check-ins yet — scan the code at your gym to start your streak.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {checkins.slice(0, 8).map((checkin) => (
                <li
                  key={checkin.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>{formatDateTime(checkin.checked_in_at)}</span>
                  <Badge
                    variant="outline"
                    className={CHECKIN_STATUS_TONE[checkin.status] ?? ""}
                  >
                    {checkin.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut />
            Log out
          </Button>
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
