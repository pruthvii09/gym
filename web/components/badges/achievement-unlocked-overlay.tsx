"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { BadgeMedallion } from "@/components/badges/badge-medallion";
import { Button } from "@/components/ui/button";
import { TIER_STYLES } from "@/lib/badge-tiers";
import { cn } from "@/lib/utils";
import type { UserBadge } from "@/types/api";

/**
 * A full celebratory moment for a just-earned badge, not a passive toast --
 * fires immediately off a badges_unlocked payload (check-in / workout
 * finish), the same response-driven pattern the rewards-unlocked cards
 * already use on the check-in success screen. Queues one at a time when
 * several badges unlock together, so each gets its own moment.
 */
export function AchievementUnlockedOverlay({
  badges,
  onDismiss,
}: {
  badges: UserBadge[];
  onDismiss: () => void;
}) {
  const [index, setIndex] = useState(0);
  const current = badges[index];

  // Reset to the front of the queue whenever a fresh batch arrives.
  useEffect(() => {
    const timeout = setTimeout(() => setIndex(0), 0);
    return () => clearTimeout(timeout);
  }, [badges]);

  if (!current) return null;
  const tier = TIER_STYLES[current.badge.tier];

  const handleNext = () => {
    if (index + 1 < badges.length) {
      setIndex((i) => i + 1);
    } else {
      onDismiss();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={handleNext}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-2xl animate-in zoom-in-95 fade-in duration-300"
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" />
          Achievement unlocked
        </p>

        <div className={cn("relative flex items-center justify-center rounded-full p-1.5", tier.ring, "ring-4")}>
          <BadgeMedallion badge={current.badge} unlocked size="lg" className="animate-in zoom-in duration-500" />
        </div>

        <div className="space-y-1">
          <p className="text-lg font-bold tracking-tight">{current.badge.name}</p>
          <p className="text-sm text-muted-foreground">{current.badge.description}</p>
          <p className="text-[11px] font-medium text-muted-foreground/80 uppercase">
            {tier.label} badge
          </p>
        </div>

        <Button variant="gradient" className="w-full" onClick={handleNext}>
          {index + 1 < badges.length ? "Next" : "Nice!"}
        </Button>

        {badges.length > 1 ? (
          <p className="text-[11px] text-muted-foreground">
            {index + 1} of {badges.length}
          </p>
        ) : null}
      </div>
    </div>
  );
}
