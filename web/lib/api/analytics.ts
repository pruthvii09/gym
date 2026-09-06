import { apiFetch } from "@/lib/api/client";
import type { AnalyticsRange, GymAnalytics, MemberAnalytics, PlatformAnalytics } from "@/types/api";

export function getMyAnalytics(range: AnalyticsRange) {
  return apiFetch<MemberAnalytics>(`/api/v1/me/analytics/?range=${range}`, {}, { auth: true });
}

export function getGymAnalytics(gymId: string, range: AnalyticsRange) {
  return apiFetch<GymAnalytics>(
    `/api/v1/gyms/${gymId}/analytics/?range=${range}`,
    {},
    { auth: true }
  );
}

export function getPlatformAnalytics(range: AnalyticsRange) {
  return apiFetch<PlatformAnalytics>(`/api/v1/admin/analytics/?range=${range}`, {}, { auth: true });
}
