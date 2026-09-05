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

// 0=Monday..6=Sunday -- see web/lib/rest-day.ts for the JS-weekday conversion.
export interface UserRestDay {
  day_of_week: number | null;
  self_service_changes_used: number;
  self_service_changes_remaining: number;
  updated_at: string;
}

export interface SetRestDayRequest {
  day_of_week: number | null;
}

export interface GymMemberDetail extends GymMember {
  streak: UserStreak;
  rest_day: UserRestDay;
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
  // Both null unless this check-in was (or already was) verified -- a
  // review/rejected check-in never touched the streak, so there's nothing
  // to report. rewards_unlocked is [] (never null) either way.
  streak: UserStreak | null;
  rewards_unlocked: UserReward[];
}

// --- Rewards ----------------------------------------------------------------
// Typed against API_CONTRACTS.md's rewards section (apps/rewards).

export type RewardType = "merchandise" | "perk";
// Mirrors GymStatus's shape exactly -- gym-proposed rewards go through the
// same pending/approve-or-reject workflow as a self-service-created gym.
// Platform-wide (staff-authored) rewards skip straight to "active".
export type RewardDefinitionStatus = "pending" | "active" | "rejected" | "inactive";
export type UserRewardStatus =
  | "earned"
  | "claimed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface ProductVariantLite {
  id: string;
  size: string;
  in_stock: boolean;
}

export interface RewardDefinition {
  id: string;
  name: string;
  description: string;
  reward_type: RewardType;
  required_streak: number;
  terms: string;
  variants: ProductVariantLite[];
  gym_name: string | null;
  created_at: string;
}

export interface RewardClaim {
  id: string;
  variant: string;
  shipping_address: Record<string, string>;
  tracking_number: string;
  carrier: string;
  status: UserRewardStatus;
  created_at: string;
  updated_at: string;
}

export interface PerkRedemption {
  id: string;
  status: UserRewardStatus;
  verified_at: string | null;
  created_at: string;
}

export interface UserReward {
  id: string;
  reward_definition: RewardDefinition;
  status: UserRewardStatus;
  earned_at: string;
  claimed_at: string | null;
}

export interface UserRewardDetail extends UserReward {
  claim: RewardClaim | null;
  perk_redemption: PerkRedemption | null;
}

export interface RewardProgress {
  reward_definition: RewardDefinition;
  user_reward: UserReward | null;
  days_remaining: number;
}

export interface ClaimRewardRequest {
  variant_id: string;
  address: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
    phone?: string;
  };
}

export interface RedeemPerkResult extends PerkRedemption {
  redemption_code?: string;
}

export interface ClaimRewardResult extends RewardClaim {
  redemption_code?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  type: string;
}

// --- Gym-proposed rewards (gym self-service) --------------------------------

export interface GymReward {
  id: string;
  name: string;
  description: string;
  reward_type: RewardType;
  required_streak: number;
  product: string | null;
  status: RewardDefinitionStatus;
  terms: string;
  created_at: string;
  updated_at: string;
}

export interface ProposeGymRewardRequest {
  name: string;
  description?: string;
  reward_type: RewardType;
  required_streak: number;
  product?: string;
  terms?: string;
}

export type UpdateGymRewardRequest = Partial<ProposeGymRewardRequest>;

export interface GymPerkRedemption {
  id: string;
  user_email: string;
  reward_name: string;
  status: UserRewardStatus;
  verified_at: string | null;
  created_at: string;
}

// --- Admin (platform-staff) rewards ------------------------------------------

export interface AdminRewardDefinition {
  id: string;
  name: string;
  description: string;
  reward_type: RewardType;
  required_streak: number;
  product: string | null;
  gym: string | null;
  gym_name: string | null;
  status: RewardDefinitionStatus;
  terms: string;
  require_email_verified: boolean;
  require_phone_verified: boolean;
  minimum_account_age_days: number;
  minimum_verified_checkins: number;
  block_if_high_risk_review: boolean;
  created_at: string;
  updated_at: string;
}

export type UpdateAdminRewardDefinitionRequest = Partial<
  Omit<AdminRewardDefinition, "id" | "gym_name" | "created_at" | "updated_at">
>;
