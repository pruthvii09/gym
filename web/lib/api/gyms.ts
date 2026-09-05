import { apiFetch } from "@/lib/api/client";
import type {
  CreateGymRequest,
  GymMembershipSummary,
  GymSummary,
  PaginatedResponse,
} from "@/types/api";

export function listGyms() {
  return apiFetch<PaginatedResponse<GymSummary>>("/api/v1/gyms/?page_size=100");
}

export function getGym(gymId: string) {
  return apiFetch<GymSummary>(`/api/v1/gyms/${gymId}/`);
}

export function createGym(payload: CreateGymRequest) {
  return apiFetch<GymSummary>(
    "/api/v1/gyms/",
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}

export function listMyGymMemberships() {
  return apiFetch<PaginatedResponse<GymMembershipSummary>>(
    "/api/v1/me/gym-memberships/?page_size=100",
    {},
    { auth: true }
  );
}
