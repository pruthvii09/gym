// Typed 1:1 against API_CONTRACTS.md §6 (apps/users) and §7.1-7.2 (apps/gyms).

export type GymStatus = "pending" | "active" | "rejected" | "inactive";

export interface GymSummary {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  latitude: string;
  longitude: string;
  checkin_radius_meters: number;
  status: GymStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateGymRequest {
  name: string;
  description?: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
  latitude: string;
  longitude: string;
  checkin_radius_meters?: number;
}

export type GymMembershipRole = "member" | "staff" | "manager" | "owner";

export interface GymMembershipSummary {
  id: string;
  gym: GymSummary;
  role: GymMembershipRole;
  status: "active" | "inactive";
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  // Optional at the API level on purpose -- the backend allows registering
  // without a gym (e.g. someone here to create their own); the frontend is
  // what makes it effectively required for the "join a gym" flow.
  gym_id?: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
  device_hash?: string;
  platform?: "ios" | "android" | "web" | "other";
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface MeResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  is_staff: boolean;
  created_at: string;
  gym: { id: string; name: string } | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// --- Admin (IsStaffUser-gated) ------------------------------------------
// Typed against API_CONTRACTS.md §16.2 (users) and §16.3 (gyms).

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  is_active: boolean;
  is_staff: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  gym: { id: string; name: string } | null;
}

// The admin gym list (GET /admin/gyms/) is a plain APIView, not paginated --
// unlike the public GET /gyms/, it returns a raw array.
export type AdminGym = GymSummary;

// --- Gym self-service management -----------------------------------------
// Typed against API_CONTRACTS.md §7.2, §7.6.

// A gym owner's own tier at that specific gym -- MEMBER never manages
// anything here, so most UI only cares about the STAFF_ROLES subset.
export type GymStaffRole = "staff" | "manager" | "owner";

export type UpdateGymRequest = Partial<CreateGymRequest>;

export interface GymMemberUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  phone_verified: boolean;
}

export interface GymMember {
  id: string;
  user: GymMemberUser;
  role: GymMembershipRole;
  status: "active" | "inactive";
  created_at: string;
}

export interface GymDevice {
  id: string;
  gym: string;
  name: string;
  device_code: string;
  status: "active" | "disabled";
  last_rotation_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GymDeviceWithSecret extends GymDevice {
  secret: string;
}

export interface GymDeviceQr {
  token: string;
  expires_at: string;
  gym_id: string;
  device_id: string;
}

export type GymStaffInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface GymStaffInviteSummary {
  id: string;
  email: string;
  role: GymStaffRole;
  status: GymStaffInviteStatus;
  invited_by_email: string;
  expires_at: string;
  created_at: string;
}

export interface GymStaffInvitePreview {
  gym: GymSummary;
  email: string;
  role: GymStaffRole;
  expires_at: string;
}

// --- Streaks & check-ins (as surfaced through the gym-member-detail view) --
// Typed against API_CONTRACTS.md §7.6, §8.1, §9.1.

export type CheckinStatus = "pending" | "verified" | "rejected" | "review";
export type CheckinVerificationMethod = "qr" | "gps" | "manual" | "admin";

export interface CheckIn {
  id: string;
  gym: string;
  status: CheckinStatus;
  verification_method: CheckinVerificationMethod;
  checked_in_at: string;
  created_at: string;
}

export interface UserStreak {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  updated_at: string;
}

export interface GymMemberDetail extends GymMember {
  streak: UserStreak;
  recent_checkins: CheckIn[];
}

// --- Member-facing check-in flow -------------------------------------------
// Typed against API_CONTRACTS.md §8.1, §9.1-9.2.

export interface CalendarDay {
  date: string;
  checked_in: boolean;
  checkin_count: number;
  gym_ids: string[];
}

export interface CalendarResponse {
  range: { start: string; end: string };
  streak: Pick<UserStreak, "current_streak" | "longest_streak" | "last_activity_date">;
  days: CalendarDay[];
}

export interface CreateCheckinRequest {
  gym_id: string;
  qr_token: string;
  latitude: string;
  longitude: string;
  location_accuracy?: number;
  device_hash?: string;
  platform?: "web";
}

export interface CreateCheckinResult extends CheckIn {
  message: string;
}
