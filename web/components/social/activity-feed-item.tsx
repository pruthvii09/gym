import Link from "next/link";
import { Dumbbell, Flame, QrCode, Trophy } from "lucide-react";

import type { ActivityItem, ActivityType } from "@/types/api";

const ICON_BY_TYPE: Record<ActivityType, typeof Flame> = {
  checkin: QrCode,
  streak_milestone: Flame,
  badge_earned: Trophy,
  workout_completed: Dumbbell,
};

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [string, number][] = [
    ["y", 31536000],
    ["mo", 2592000],
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ];
  for (const [label, secondsPerUnit] of units) {
    const value = Math.floor(seconds / secondsPerUnit);
    if (value >= 1) return `${value}${label} ago`;
  }
  return "just now";
}

export function ActivityFeedItem({ item }: { item: ActivityItem }) {
  const Icon = ICON_BY_TYPE[item.type];
  const name = [item.actor.first_name, item.actor.last_name].filter(Boolean).join(" ") ||
    item.actor.username;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <Link href={`/u/${item.actor.username}`} className="font-medium hover:underline">
          {name}
        </Link>{" "}
        <span className="text-muted-foreground">{item.summary}</span>
      </p>
      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
    </li>
  );
}
