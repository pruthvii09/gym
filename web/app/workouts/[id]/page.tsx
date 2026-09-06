"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Dumbbell, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExercisePickerSheet } from "@/components/workouts/exercise-picker-sheet";
import { SessionExerciseCard } from "@/components/workouts/session-exercise-card";
import { formatDuration } from "@/components/workouts/workout-history-card";
import { AchievementUnlockedOverlay } from "@/components/badges/achievement-unlocked-overlay";
import {
  addSessionExercise,
  cancelWorkoutSession,
  finishWorkoutSession,
  getWorkoutSession,
} from "@/lib/api/workouts";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { UserBadge, WorkoutSessionDetail } from "@/types/api";

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Elapsed time is computed inside the effect/interval callback (a side
// effect), never directly during render -- Date.now() is impure and React
// disallows calling it while rendering.
function useLiveElapsedSeconds(startedAt: string | null) {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const startMs = new Date(startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Gated on startedAt (not just returning the raw state) so a session
  // that just went inactive doesn't keep showing its last-ticked value.
  return startedAt ? elapsed : null;
}

export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: me, loading: userLoading } = useCurrentUser();
  const [session, setSession] = useState<WorkoutSessionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlockedBadges, setUnlockedBadges] = useState<UserBadge[]>([]);

  const load = () => {
    getWorkoutSession(params.id)
      .then(setSession)
      .catch(() => setLoadError("Couldn't load this workout."));
  };

  useEffect(() => {
    if (!me) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, params.id]);

  useEffect(() => {
    if (!userLoading && !me) router.replace(`/login?next=/workouts`);
  }, [userLoading, me, router]);

  const isActive = session?.status === "active";
  const liveSeconds = useLiveElapsedSeconds(isActive ? (session?.started_at ?? null) : null);

  const handleAddExercise = async (exercise: { id: string }) => {
    await addSessionExercise(params.id, exercise.id);
    setPickerOpen(false);
    load();
  };

  const handleFinish = async () => {
    setFinishing(true);
    setActionError(null);
    try {
      const updated = await finishWorkoutSession(params.id);
      setSession(updated);
      if (updated.badges_unlocked.length > 0) setUnlockedBadges(updated.badges_unlocked);
    } catch (err) {
      // leave the session active -- the finish bar stays put so they can retry
      setActionError(err instanceof ApiError ? err.message : "Couldn't finish this workout.");
    } finally {
      setFinishing(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const updated = await cancelWorkoutSession(params.id);
      setSession(updated);
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  };

  if (userLoading || !me || (!session && !loadError)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" render={<Link href="/workouts" />}>
          Back to workouts
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-24">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/workouts"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:px-8">
        <Card className={isActive ? "border-primary/25 bg-primary/5" : undefined}>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Dumbbell className="size-5" />
              </span>
              <div>
                <p className="text-2xl leading-none font-bold tabular-nums">
                  {isActive
                    ? formatElapsed(liveSeconds ?? 0)
                    : formatDuration(session.duration_seconds)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.gym_name} — {isActive ? "in progress" : session.status}
                </p>
              </div>
            </div>
            {session.status === "completed" ? (
              <CheckCircle2 className="size-6 text-success" />
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Exercises</p>
            {isActive ? (
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                <Plus />
                Add exercise
              </Button>
            ) : null}
          </div>

          {session.exercises.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {isActive
                  ? "No exercises yet — add your first one."
                  : "No exercises were logged in this workout."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {session.exercises.map((sessionExercise) => (
                <SessionExerciseCard
                  key={sessionExercise.id}
                  sessionId={session.id}
                  sessionExercise={sessionExercise}
                  readOnly={!isActive}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {isActive ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border/70 bg-background/95 px-6 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                <X />
                Cancel
              </Button>
              <Button variant="gradient" onClick={handleFinish} disabled={finishing}>
                {finishing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Finish workout
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ExercisePickerSheet open={pickerOpen} onOpenChange={setPickerOpen} onAdd={handleAddExercise} />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this workout?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything logged so far will be kept, but marked as cancelled instead of completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep going</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? <Loader2 className="animate-spin" /> : null}
              Cancel workout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {unlockedBadges.length > 0 ? (
        <AchievementUnlockedOverlay
          badges={unlockedBadges}
          onDismiss={() => setUnlockedBadges([])}
        />
      ) : null}
    </div>
  );
}
