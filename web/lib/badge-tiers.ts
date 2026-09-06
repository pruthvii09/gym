import {
  Award,
  Crown,
  Dumbbell,
  Flame,
  Footprints,
  Gift,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { BadgeTier } from "@/types/api";

// Keyed by Badge.icon (a plain string the backend/admin controls, see
// apps/badges/models.py) -- covers the seed migration's starter set, with a
// safe fallback (DEFAULT_BADGE_ICON) for any future badge whose icon name
// isn't in this map yet. Exported as a plain object (not wrapped in a
// lookup function) so callers do a member access (`ICON_MAP[x] ?? Default`)
// rather than a function call when picking the component to render --
// react-compiler's static-components check flags a function-call result
// used as a JSX tag as "created during render" even when it's a stable
// lookup, the same reasoning app/gyms/[id]/manage/layout.tsx's `tab.icon`
// pattern already relies on.
export const ICON_MAP: Record<string, LucideIcon> = {
  Footprints,
  Flame,
  Trophy,
  Crown,
  Dumbbell,
  Zap,
  Gift,
};

export const DEFAULT_BADGE_ICON: LucideIcon = Award;

interface TierStyle {
  label: string;
  // Unlocked medallion background + ring.
  gradient: string;
  ring: string;
  glow: string;
  // Locked (silhouette) treatment.
  lockedBg: string;
  textOnFill: string;
}

// Every class here is a fully literal string -- Tailwind's build-time
// scanner can't see through `bg-${tier}-...` interpolation (the same lesson
// learned building the analytics stat cards), so this is a lookup, not a
// template.
export const TIER_STYLES: Record<BadgeTier, TierStyle> = {
  bronze: {
    label: "Bronze",
    gradient: "bg-gradient-to-br from-amber-700 via-amber-600 to-amber-800",
    ring: "ring-amber-700/40",
    glow: "shadow-[0_0_24px_-4px_rgba(180,83,9,0.55)]",
    lockedBg: "bg-muted",
    textOnFill: "text-amber-50",
  },
  silver: {
    label: "Silver",
    gradient: "bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500",
    ring: "ring-slate-400/40",
    glow: "shadow-[0_0_24px_-4px_rgba(100,116,139,0.55)]",
    lockedBg: "bg-muted",
    textOnFill: "text-slate-900",
  },
  gold: {
    label: "Gold",
    gradient: "bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-500",
    ring: "ring-amber-400/50",
    glow: "shadow-[0_0_28px_-2px_rgba(245,158,11,0.6)]",
    lockedBg: "bg-muted",
    textOnFill: "text-amber-950",
  },
  platinum: {
    label: "Platinum",
    gradient: "bg-gradient-to-br from-indigo-400 via-purple-500 to-fuchsia-500",
    ring: "ring-purple-500/50",
    glow: "shadow-[0_0_32px_-2px_rgba(168,85,247,0.65)]",
    lockedBg: "bg-muted",
    textOnFill: "text-white",
  },
};
