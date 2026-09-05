"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addExerciseSet, deleteExerciseSet } from "@/lib/api/workouts";
import { ApiError } from "@/lib/api/client";
import type { SessionExercise } from "@/types/api";

export function SessionExerciseCard({
  sessionId,
  sessionExercise,
  readOnly,
  onChanged,
}: {
  sessionId: string;
  sessionExercise: SessionExercise;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddSet = async () => {
    const repsNum = Number(reps);
    if (!repsNum || repsNum <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await addExerciseSet(sessionId, sessionExercise.id, {
        reps: repsNum,
        weight_kg: weight.trim() ? Number(weight) : null,
      });
      setReps("");
      setWeight("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that set.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSet = async (setId: string) => {
    setDeletingId(setId);
    try {
      await deleteExerciseSet(sessionId, sessionExercise.id, setId);
      onChanged();
    } catch {
      // leave the row in place -- a silent failure here just means "try again"
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium">{sessionExercise.exercise.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground capitalize">
              {sessionExercise.exercise.category}
            </Badge>
            {sessionExercise.exercise.equipment ? (
              <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground capitalize">
                {sessionExercise.exercise.equipment}
              </Badge>
            ) : null}
          </div>
        </div>

        {sessionExercise.sets.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <th className="w-10 py-1.5 pl-3 text-left font-medium">Set</th>
                  <th className="py-1.5 text-left font-medium">Reps</th>
                  <th className="py-1.5 text-left font-medium">Weight</th>
                  {!readOnly ? <th className="w-8" /> : null}
                </tr>
              </thead>
              <tbody>
                {sessionExercise.sets.map((set) => (
                  <tr key={set.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 pl-3 text-muted-foreground">{set.set_number}</td>
                    <td className="py-1.5">{set.reps}</td>
                    <td className="py-1.5">{set.weight_kg ? `${set.weight_kg} kg` : "—"}</td>
                    {!readOnly ? (
                      <td className="py-1.5 pr-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteSet(set.id)}
                          disabled={deletingId === set.id}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {deletingId === set.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sets logged yet.</p>
        )}

        {!readOnly ? (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Reps</label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="10"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Weight (kg)</label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="optional"
              />
            </div>
            <Button size="sm" onClick={handleAddSet} disabled={busy || !reps}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              Set
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
