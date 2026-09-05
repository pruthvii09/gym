import Link from "next/link";
import { Dumbbell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { WorkoutSessionSummary } from "@/types/api";

const STATUS_TONE: Record<string, string> = {
  active: "border-primary/25 bg-primary/10 text-primary",
  completed: "border-success/20 bg-success/10 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "In progress";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hrs}h ${rest}m` : `${hrs}h`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function WorkoutHistoryCard({ session }: { session: WorkoutSessionSummary }) {
  return (
    <Link href={`/workouts/${session.id}`}>
      <Card className="transition-colors hover:border-primary/30">
        <CardContent className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Dumbbell className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{formatDate(session.started_at)}</p>
              <Badge variant="outline" className={STATUS_TONE[session.status] ?? ""}>
                {session.status}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {session.gym_name} — {session.exercise_count} exercise
              {session.exercise_count === 1 ? "" : "s"} — {formatDuration(session.duration_seconds)}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
