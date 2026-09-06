"use client";

import { Lock } from "lucide-react";

import { DEFAULT_BADGE_ICON, ICON_MAP, TIER_STYLES } from "@/lib/badge-tiers";
import { cn } from "@/lib/utils";
import type { Badge } from "@/types/api";

const SIZE_CLASSES = {
  sm: "size-12",
  md: "size-16",
  lg: "size-24",
} as const;

const ICON_SIZE_CLASSES = {
  sm: "size-5",
  md: "size-7",
  lg: "size-10",
} as const;

export function BadgeMedallion({
  badge,
  unlocked,
  size = "md",
  className,
}: {
  badge: Badge;
  unlocked: boolean;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const Icon = ICON_MAP[badge.icon] ?? DEFAULT_BADGE_ICON;
  const tier = TIER_STYLES[badge.tier];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full ring-4 transition-all",
        SIZE_CLASSES[size],
        unlocked ? cn(tier.gradient, tier.ring, tier.glow) : cn(tier.lockedBg, "ring-border"),
        className
      )}
    >
      {unlocked ? (
        <Icon className={cn(ICON_SIZE_CLASSES[size], tier.textOnFill)} />
      ) : (
        <>
          <Icon className={cn(ICON_SIZE_CLASSES[size], "text-muted-foreground/40")} />
          <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
            <Lock className="size-3" />
          </span>
        </>
      )}
    </div>
  );
}

export function BadgeProgressBar({ current, threshold }: { current: number; threshold: number }) {
  const pct = Math.min(100, Math.round((current / threshold) * 100));
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-brand transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {current} / {threshold}
      </p>
    </div>
  );
}
