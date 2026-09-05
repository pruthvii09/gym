import { apiFetch } from "@/lib/api/client";
import type { AdminGym, AdminUser, GymStatus, PaginatedResponse } from "@/types/api";

// GET /admin/gyms/ is a plain APIView, not paginated -- returns a raw array.
export function listAdminGyms(status?: GymStatus) {
  const query = status ? `?status=${status}` : "";
  return apiFetch<AdminGym[]>(`/api/v1/admin/gyms/${query}`, {}, { auth: true });
}

export function approveGym(id: string) {
  return apiFetch<AdminGym>(
    `/api/v1/admin/gyms/${id}/approve/`,
    { method: "POST" },
    { auth: true }
  );
}

export function rejectGym(id: string, reason?: string) {
  return apiFetch<AdminGym>(
    `/api/v1/admin/gyms/${id}/reject/`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? "" }) },
    { auth: true }
  );
}

export function listAdminUsers(params: { search?: string; isActive?: boolean } = {}) {
  const query = new URLSearchParams({ page_size: "50" });
  if (params.search) query.set("search", params.search);
  if (params.isActive !== undefined) query.set("is_active", String(params.isActive));
  return apiFetch<PaginatedResponse<AdminUser>>(
    `/api/v1/admin/users/?${query.toString()}`,
    {},
    { auth: true }
  );
}

export function setUserActive(id: string, isActive: boolean, reason?: string) {
  return apiFetch<AdminUser>(
    `/api/v1/admin/users/${id}/status/`,
    { method: "POST", body: JSON.stringify({ is_active: isActive, reason: reason ?? "" }) },
    { auth: true }
  );
}
