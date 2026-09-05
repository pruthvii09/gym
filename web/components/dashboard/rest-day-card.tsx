"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMyRestDay, updateMyRestDay } from "@/lib/api/streaks";
import { ApiError } from "@/lib/api/client";
import { WEEKDAY_LABELS } from "@/lib/rest-day";
import type { UserRestDay } from "@/types/api";

export function RestDayCard({ onChanged }: { onChanged: () => void }) {
  const [restDay, setRestDay] = useState<UserRestDay | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyRestDay()
      .then((data) => setRestDay(data))
      .catch(() => setRestDay(null));
  }, []);

  const handleSave = async () => {
    if (selected === "") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMyRestDay({ day_of_week: Number(selected) });
      setRestDay(updated);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update your rest day.");
    } finally {
      setBusy(false);
    }
  };

  if (!restDay) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const hasDay = restDay.day_of_week !== null;
  const locked = restDay.self_service_changes_remaining === 0;
  const showPicker = editing || !hasDay;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarOff className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Weekly rest day</p>
              <p className="text-xs text-muted-foreground">
                {hasDay
                  ? `${WEEKDAY_LABELS[restDay.day_of_week!]} won't break your streak`
                  : "Pick a day that won't break your streak, even if you skip the gym"}
              </p>
            </div>
          </div>
          {hasDay && !showPicker ? (
            locked ? (
              <p className="shrink-0 text-xs text-muted-foreground">
                No changes left — ask your gym&apos;s staff to update it
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelected(String(restDay.day_of_week));
                  setEditing(true);
                }}
              >
                Change
              </Button>
            )
          ) : null}
        </div>

        {showPicker ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={selected}
              onValueChange={(v) => setSelected(v ?? "")}
              items={Object.fromEntries(WEEKDAY_LABELS.map((label, i) => [String(i), label]))}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Choose a day" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, i) => (
                  <SelectItem key={label} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={busy || selected === ""}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Save
              </Button>
              {hasDay ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {hasDay ? (
          <p className="text-xs text-muted-foreground">
            {restDay.self_service_changes_used}/
            {restDay.self_service_changes_used + restDay.self_service_changes_remaining} changes
            used
          </p>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
