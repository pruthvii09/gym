"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listMyCheckins } from "@/lib/api/checkins";
import type { CheckIn } from "@/types/api";

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

export function RecentCheckinsCard() {
  const [checkins, setCheckins] = useState<CheckIn[] | null>(null);

  useEffect(() => {
    listMyCheckins()
      .then((res) => setCheckins(res.results))
      .catch(() => setCheckins([]));
  }, []);

  return (
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
                <Badge variant="outline" className={CHECKIN_STATUS_TONE[checkin.status] ?? ""}>
                  {checkin.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
