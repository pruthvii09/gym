import { apiFetch } from "@/lib/api/client";
import type { CalendarResponse, SetRestDayRequest, UserRestDay, UserStreak } from "@/types/api";

export function getMyStreak() {
  return apiFetch<UserStreak>("/api/v1/me/streak/", {}, { auth: true });
}

export function getMyCalendar(start: string, end: string) {
  return apiFetch<CalendarResponse>(
    `/api/v1/me/calendar/?start=${start}&end=${end}`,
    {},
    { auth: true }
  );
}

export function getMyRestDay() {
  return apiFetch<UserRestDay>("/api/v1/me/rest-day/", {}, { auth: true });
}

export function updateMyRestDay(payload: SetRestDayRequest) {
  return apiFetch<UserRestDay>(
    "/api/v1/me/rest-day/",
    { method: "PATCH", body: JSON.stringify(payload) },
    { auth: true }
  );
}
