"use client";

import { BadgeMedallion, BadgeProgressBar } from "@/components/badges/badge-medallion";
import { TIER_STYLES } from "@/lib/badge-tiers";
import { cn } from "@/lib/utils";
import type { BadgeProgress } from "@/types/api";

export function BadgeGrid({
  progress,
  selectable,
  selectedBadgeIds,
  onToggleSelect,
}: {
  progress: BadgeProgress[];
  selectable?: boolean;
  selectedBadgeIds?: Set<string>;
  onToggleSelect?: (badgeId: string) => void;
}) {
  if (progress.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No badges yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {progress.map(({ badge, user_badge, current_value }) => {
        const unlocked = !!user_badge;
        const isSelected = !!selectedBadgeIds?.has(badge.id);
        const canSelect = selectable && unlocked;

        return (
          <div
            key={badge.id}
            role={canSelect ? "button" : undefined}
            tabIndex={canSelect ? 0 : undefined}
            onClick={canSelect ? () => onToggleSelect?.(badge.id) : undefined}
            onKeyDown={
              canSelect
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleSelect?.(badge.id);
                    }
                  }
                : undefined
            }
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center",
              canSelect && "cursor-pointer hover:border-primary/40",
              isSelected && "border-primary bg-primary/5 ring-1 ring-primary/30"
            )}
          >
            <BadgeMedallion badge={badge} unlocked={unlocked} />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">{badge.name}</p>
              <p className="text-[10px] text-muted-foreground">{TIER_STYLES[badge.tier].label}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">{badge.description}</p>
            {!unlocked ? (
              <BadgeProgressBar current={current_value} threshold={badge.threshold} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
