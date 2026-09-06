import { apiFetch } from "@/lib/api/client";
import type { BadgeProgress, UserBadge } from "@/types/api";

export function listMyBadges() {
  return apiFetch<BadgeProgress[]>("/api/v1/me/badges/", {}, { auth: true });
}

export function setFeaturedBadges(badgeIds: string[]) {
  return apiFetch<UserBadge[]>(
    "/api/v1/me/badges/featured/",
    { method: "PUT", body: JSON.stringify({ badge_ids: badgeIds }) },
    { auth: true }
  );
}
