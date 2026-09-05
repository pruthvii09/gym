"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Dumbbell, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkoutHistoryCard } from "@/components/workouts/workout-history-card";
import { listMyCheckins } from "@/lib/api/checkins";
import { listMyWorkoutSessions, startWorkoutSession } from "@/lib/api/workouts";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { toUtcIsoDate } from "@/lib/utils";
import type { WorkoutSessionSummary } from "@/types/api";

export default function WorkoutsPage() {
  const router = useRouter();
  const { user: me, loading: userLoading } = useCurrentUser();
  const [sessions, setSessions] = useState<WorkoutSessionSummary[] | null>(null);
  const [checkedInToday, setCheckedInToday] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    listMyWorkoutSessions()
      .then((res) => setSessions(res.results))
      .catch(() => setSessions([]));

    // Mirrors apps.workouts.services.start_session's own check exactly (a
    // VERIFIED CheckIn today) rather than proxying through UserStreak --
    // the streak is a separate cached derivation that only updates when
    // rebuild_user_streak runs, and can lag a real check-in (e.g. one
    // inserted directly, or any other path that skips that rebuild),
    // which would otherwise disable this button despite the backend being
    // ready to accept the start request.
    listMyCheckins()
      .then((res) => {
        const todayUtc = toUtcIsoDate(new Date());
        setCheckedInToday(
          res.results.some(
            (c) => c.status === "verified" && c.checked_in_at.slice(0, 10) === todayUtc
          )
        );
      })
      .catch(() => setCheckedInToday(false));
  }, [me]);

  useEffect(() => {
    if (!userLoading && !me) router.replace(`/login?next=${encodeURIComponent("/workouts")}`);
  }, [userLoading, me, router]);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const session = await startWorkoutSession();
      router.push(`/workouts/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a workout.");
      setStarting(false);
    }
  };

  if (userLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const activeSession = sessions?.find((s) => s.status === "active");

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
            <h1 className="text-2xl font-semibold tracking-tight">Workouts</h1>
            <p className="mt-1 text-muted-foreground">Log exercises, sets, and reps.</p>
          </div>
          {activeSession ? (
            <Button variant="gradient" render={<Link href={`/workouts/${activeSession.id}`} />}>
              <Dumbbell />
              Resume workout
            </Button>
          ) : (
            <Button
              variant="gradient"
              onClick={handleStart}
              disabled={starting || checkedInToday === false}
            >
              {starting ? <Loader2 className="animate-spin" /> : <Dumbbell />}
              Start workout
            </Button>
          )}
        </div>

        {checkedInToday === false && !activeSession ? (
          <p className="-mt-2 text-sm text-muted-foreground">
            Check in at your gym before starting a workout.
          </p>
        ) : null}
        {error ? <p className="-mt-2 text-sm text-destructive">{error}</p> : null}

        {sessions === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Dumbbell className="size-8 text-muted-foreground" />
              <p className="font-medium">No workouts logged yet</p>
              <p className="text-sm text-muted-foreground">
                Check in at your gym, then start a workout to track exercises, sets, and reps.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <WorkoutHistoryCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
