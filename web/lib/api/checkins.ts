import { apiFetch } from "@/lib/api/client";
import type {
  CalendarResponse,
  CheckIn,
  CreateCheckinRequest,
  CreateCheckinResult,
  PaginatedResponse,
  UserStreak,
} from "@/types/api";

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

export function listMyCheckins() {
  return apiFetch<PaginatedResponse<CheckIn>>(
    "/api/v1/me/checkins/?page_size=20",
    {},
    { auth: true }
  );
}

export function createCheckin(payload: CreateCheckinRequest) {
  return apiFetch<CreateCheckinResult>(
    "/api/v1/checkins/",
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}
