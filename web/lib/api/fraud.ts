import { apiFetch } from "@/lib/api/client";
import type {
  AdminFraudEvent,
  AdminFraudReview,
  CreateReviewFromEventsRequest,
  FraudEventType,
  FraudReviewStatus,
  FraudRiskLevel,
  PaginatedResponse,
  ResolveFraudReviewRequest,
} from "@/types/api";

export interface FraudReviewFilters {
  status?: FraudReviewStatus | "all";
  risk_level?: FraudRiskLevel;
  search?: string;
  user?: string;
}

export function listFraudReviews(filters: FraudReviewFilters = {}) {
  const query = new URLSearchParams({ page_size: "50" });
  if (filters.status && filters.status !== "all") query.set("status", filters.status);
  if (filters.risk_level) query.set("risk_level", filters.risk_level);
  if (filters.search) query.set("search", filters.search);
  if (filters.user) query.set("user", filters.user);
  return apiFetch<PaginatedResponse<AdminFraudReview>>(
    `/api/v1/admin/fraud-reviews/?${query.toString()}`,
    {},
    { auth: true }
  );
}

export function getFraudReview(id: string) {
  return apiFetch<AdminFraudReview>(`/api/v1/admin/fraud-reviews/${id}/`, {}, { auth: true });
}

export function resolveFraudReview(id: string, payload: ResolveFraudReviewRequest) {
  return apiFetch<AdminFraudReview>(
    `/api/v1/admin/fraud-reviews/${id}/resolve/`,
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}

export interface FraudEventFilters {
  user?: string;
  event_type?: FraudEventType;
  review?: string;
  search?: string;
}

export function listFraudEvents(filters: FraudEventFilters = {}) {
  const query = new URLSearchParams({ page_size: "50" });
  if (filters.user) query.set("user", filters.user);
  if (filters.event_type) query.set("event_type", filters.event_type);
  if (filters.review) query.set("review", filters.review);
  if (filters.search) query.set("search", filters.search);
  return apiFetch<PaginatedResponse<AdminFraudEvent>>(
    `/api/v1/admin/fraud-events/?${query.toString()}`,
    {},
    { auth: true }
  );
}

export function createReviewFromEvents(payload: CreateReviewFromEventsRequest) {
  return apiFetch<AdminFraudReview>(
    "/api/v1/admin/fraud-reviews/from-events/",
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}
