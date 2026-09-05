import { apiFetch } from "@/lib/api/client";
import type {
  GymDevice,
  GymDeviceQr,
  GymDeviceWithSecret,
  GymMember,
  GymMemberDetail,
  GymStaffInvitePreview,
  GymStaffInviteSummary,
  GymStaffRole,
  GymSummary,
  PaginatedResponse,
  UpdateGymRequest,
} from "@/types/api";

export function updateGym(gymId: string, payload: UpdateGymRequest) {
  return apiFetch<GymSummary>(
    `/api/v1/gyms/${gymId}/`,
    { method: "PATCH", body: JSON.stringify(payload) },
    { auth: true }
  );
}

export function listGymMembers(gymId: string) {
  return apiFetch<PaginatedResponse<GymMember>>(
    `/api/v1/gyms/${gymId}/members/?page_size=100`,
    {},
    { auth: true }
  );
}

export function getGymMemberDetail(gymId: string, membershipId: string) {
  return apiFetch<GymMemberDetail>(
    `/api/v1/gyms/${gymId}/members/${membershipId}/`,
    {},
    { auth: true }
  );
}

export function removeGymMember(gymId: string, membershipId: string) {
  return apiFetch<undefined>(
    `/api/v1/gyms/${gymId}/members/${membershipId}/`,
    { method: "DELETE" },
    { auth: true }
  );
}

export function listGymDevices(gymId: string) {
  return apiFetch<PaginatedResponse<GymDevice>>(
    `/api/v1/gyms/${gymId}/devices/?page_size=100`,
    {},
    { auth: true }
  );
}

export function createGymDevice(gymId: string, name: string) {
  return apiFetch<GymDeviceWithSecret>(
    "/api/v1/gym-devices/",
    { method: "POST", body: JSON.stringify({ gym: gymId, name }) },
    { auth: true }
  );
}

export function rotateGymDevice(deviceId: string) {
  return apiFetch<GymDeviceWithSecret>(
    `/api/v1/gym-devices/${deviceId}/rotate/`,
    { method: "POST" },
    { auth: true }
  );
}

export function getGymDeviceQr(deviceId: string) {
  return apiFetch<GymDeviceQr>(`/api/v1/gym-devices/${deviceId}/qr/`, {}, { auth: true });
}

export function listGymStaff(gymId: string) {
  return apiFetch<PaginatedResponse<GymMember>>(
    `/api/v1/gyms/${gymId}/staff/?page_size=100`,
    {},
    { auth: true }
  );
}

export function updateGymStaffRole(gymId: string, membershipId: string, role: GymStaffRole) {
  return apiFetch<GymMember>(
    `/api/v1/gyms/${gymId}/staff/${membershipId}/`,
    { method: "PATCH", body: JSON.stringify({ role }) },
    { auth: true }
  );
}

export function removeGymStaff(gymId: string, membershipId: string) {
  return apiFetch<undefined>(
    `/api/v1/gyms/${gymId}/staff/${membershipId}/`,
    { method: "DELETE" },
    { auth: true }
  );
}

export function listGymStaffInvites(gymId: string) {
  return apiFetch<GymStaffInviteSummary[]>(
    `/api/v1/gyms/${gymId}/staff-invites/`,
    {},
    { auth: true }
  );
}

export function createGymStaffInvite(gymId: string, email: string, role: GymStaffRole) {
  return apiFetch<GymStaffInviteSummary>(
    `/api/v1/gyms/${gymId}/staff-invites/`,
    { method: "POST", body: JSON.stringify({ email, role }) },
    { auth: true }
  );
}

export function revokeGymStaffInvite(gymId: string, inviteId: string) {
  return apiFetch<GymStaffInviteSummary>(
    `/api/v1/gyms/${gymId}/staff-invites/${inviteId}/revoke/`,
    { method: "POST" },
    { auth: true }
  );
}

export function previewGymStaffInvite(token: string) {
  return apiFetch<GymStaffInvitePreview>(`/api/v1/staff-invites/${token}/`);
}

export function acceptGymStaffInvite(token: string) {
  return apiFetch<GymMember>(
    `/api/v1/staff-invites/${token}/accept/`,
    { method: "POST" },
    { auth: true }
  );
}
