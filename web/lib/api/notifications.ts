import { apiFetch } from "@/lib/api/client";
import type {
  NotificationSummary,
  PaginatedResponse,
  RegisterPushSubscriptionRequest,
  UnreadCountResponse,
  VapidPublicKeyResponse,
} from "@/types/api";

export function getNotifications(page = 1) {
  return apiFetch<PaginatedResponse<NotificationSummary>>(
    `/api/v1/me/notifications/?page=${page}`,
    {},
    { auth: true }
  );
}

export function getUnreadNotificationCount() {
  return apiFetch<UnreadCountResponse>("/api/v1/me/notifications/unread-count/", {}, { auth: true });
}

export function markNotificationRead(id: string) {
  return apiFetch<NotificationSummary>(
    `/api/v1/me/notifications/${id}/read/`,
    { method: "POST" },
    { auth: true }
  );
}

export function getVapidPublicKey() {
  return apiFetch<VapidPublicKeyResponse>("/api/v1/push/vapid-public-key/");
}

export function registerPushSubscription(payload: RegisterPushSubscriptionRequest) {
  return apiFetch<void>(
    "/api/v1/me/push-subscriptions/",
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}

export function unregisterPushSubscription(endpoint: string) {
  return apiFetch<void>(
    "/api/v1/me/push-subscriptions/",
    { method: "DELETE", body: JSON.stringify({ endpoint }) },
    { auth: true }
  );
}
