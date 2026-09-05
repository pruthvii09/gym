"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listMyWorkoutSessions } from "@/lib/api/workouts";
import type { WorkoutSessionSummary } from "@/types/api";

export function ActiveWorkoutBanner() {
  const [active, setActive] = useState<WorkoutSessionSummary | null>(null);

  useEffect(() => {
    listMyWorkoutSessions()
      .then((res) => {
        const first = res.results[0];
        setActive(first && first.status === "active" ? first : null);
      })
      .catch(() => setActive(null));
  }, []);

  if (!active) return null;

  return (
    <Alert className="-mt-2 border-primary/25 bg-primary/5 text-primary">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-current">
        <span className="flex items-center gap-1.5">
          <Dumbbell className="size-4" />
          Workout in progress — resume where you left off.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-primary/30 text-primary hover:bg-primary/10"
          render={<Link href={`/workouts/${active.id}`} />}
        >
          Resume
        </Button>
      </AlertDescription>
    </Alert>
  );
}
