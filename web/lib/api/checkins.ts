import { apiFetch } from "@/lib/api/client";
import type {
  CheckIn,
  CreateCheckinRequest,
  CreateCheckinResult,
  PaginatedResponse,
} from "@/types/api";

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
