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
  // Lowercase letters, numbers, underscores only, 3-30 characters -- powers
  // the public profile/search surface (web/lib/badge-tiers.ts et al), never
  // used for auth (email remains the login identifier).
  username: string;
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
  username: string;
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
  username: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  is_staff: boolean;
  created_at: string;
  gym: { id: string; name: string } | null;
}

export interface UpdateProfileRequest {
  username?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
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
  recent_workouts: WorkoutSessionSummary[];
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
  // to report. rewards_unlocked/badges_unlocked are [] (never null) either way.
  streak: UserStreak | null;
  rewards_unlocked: UserReward[];
  badges_unlocked: UserBadge[];
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

// --- Workouts -----------------------------------------------------------
// Typed against apps/workouts. The exercise catalog is a vendored public
// dataset (apps/workouts/data/exercises.json), seeded once -- not a live
// third-party API.

export type ExerciseCategory =
  | "strength"
  | "cardio"
  | "stretching"
  | "olympic weightlifting"
  | "strongman"
  | "plyometrics"
  | "powerlifting";

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  level: string;
  mechanic: string;
  primary_muscles: string[];
  secondary_muscles: string[];
}

export interface ExerciseDetail extends Exercise {
  instructions: string[];
}

export interface ExerciseSet {
  id: string;
  set_number: number;
  reps: number;
  weight_kg: string | null;
  created_at: string;
}

export interface AddSetRequest {
  reps: number;
  weight_kg?: number | null;
}

export type WorkoutSessionStatus = "active" | "completed" | "cancelled";

export interface SessionExercise {
  id: string;
  exercise: Exercise;
  order: number;
  sets: ExerciseSet[];
}

// Shape returned by the history list and the gym-staff member sheet -- no
// nested exercises/sets, just enough for a summary card.
export interface WorkoutSessionSummary {
  id: string;
  gym_name: string;
  started_at: string;
  ended_at: string | null;
  status: WorkoutSessionStatus;
  exercise_count: number;
  duration_seconds: number | null;
}

export interface WorkoutSessionDetail extends WorkoutSessionSummary {
  exercises: SessionExercise[];
}

// finish_session's response shape only -- start/get/cancel return
// WorkoutSessionDetail without this key, since only finishing can unlock a
// workout/set-driven badge.
export interface FinishWorkoutSessionResult extends WorkoutSessionDetail {
  badges_unlocked: UserBadge[];
}

// --- Fraud (platform-staff) ---------------------------------------------

export type FraudRiskLevel = "low" | "medium" | "high";
export type FraudReviewStatus = "open" | "approved" | "rejected";
export type FraudEventType =
  | "qr_reuse"
  | "gps_mismatch"
  | "too_many_checkins"
  | "impossible_travel"
  | "multiple_accounts_device"
  | "suspicious_pattern"
  | "device_anomaly"
  | "suspicious_account_creation"
  | "suspicious_reward_claim";

export interface AdminFraudReview {
  id: string;
  user: string;
  user_email: string;
  risk_level: FraudRiskLevel;
  status: FraudReviewStatus;
  reason: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_email: string | null;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
}

export interface ResolveFraudReviewRequest {
  status: "approved" | "rejected";
  resolution_notes?: string;
}

export interface AdminFraudEvent {
  id: string;
  user: string;
  user_email: string;
  checkin: string | null;
  checkin_gym_name: string | null;
  checkin_checked_in_at: string | null;
  review: string | null;
  event_type: FraudEventType;
  details: string;
  created_at: string;
}

export interface CreateReviewFromEventsRequest {
  event_ids: string[];
  reason?: string;
}

// --- Analytics ------------------------------------------------------------
// range=7d|30d|90d|all. 7d/30d bucket daily, 90d/all bucket weekly --
// `period` is always an ISO date string (the bucket's start day).

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export interface AnalyticsRangeInfo {
  start: string | null;
  end: string;
}

export interface PeriodCount {
  period: string;
  count: number;
}

export interface WorkoutVolumePoint {
  period: string;
  sets: number;
  total_weight_kg: number;
}

export interface MuscleSetCount {
  muscle: string;
  sets: number;
}

export interface MemberAnalytics {
  range: AnalyticsRangeInfo;
  checkins_over_time: PeriodCount[];
  workout_volume_over_time: WorkoutVolumePoint[];
  muscle_set_counts: MuscleSetCount[];
  rewards_earned_over_time: PeriodCount[];
  stats: {
    current_streak: number;
    longest_streak: number;
    total_checkins: number;
    total_workouts: number;
    total_sets: number;
    favorite_gym_name: string | null;
  };
}

// day_of_week: 1=Sunday..7=Saturday (Django's ExtractWeekDay convention) --
// convert to a JS Date weekday with `day_of_week - 1`.
export interface CheckinHeatmapCell {
  day_of_week: number;
  hour: number;
  count: number;
}

export interface GymAnalytics {
  range: AnalyticsRangeInfo;
  checkins_over_time: PeriodCount[];
  member_growth: PeriodCount[];
  checkin_heatmap: CheckinHeatmapCell[];
  rewards_earned_over_time: PeriodCount[];
  stats: {
    total_members: number;
    active_members_this_week: number;
    inactive_members_this_week: number;
    average_current_streak: number;
    checkins_this_month: number;
  };
}

export interface StreakDistributionBucket {
  bucket: string;
  count: number;
}

export interface FraudReviewsOverTimePoint {
  period: string;
  open: number;
  approved: number;
  rejected: number;
}

export interface TopGymByCheckins {
  gym_name: string;
  count: number;
}

export interface PlatformAnalytics {
  range: AnalyticsRangeInfo;
  checkins_over_time: PeriodCount[];
  signups_over_time: PeriodCount[];
  streak_distribution: StreakDistributionBucket[];
  fraud_reviews_over_time: FraudReviewsOverTimePoint[];
  top_gyms_by_checkins: TopGymByCheckins[];
  stats: {
    total_users: number;
    total_gyms: number;
    pending_gyms: number;
    total_checkins_all_time: number;
    open_fraud_reviews: number;
    total_workouts_logged: number;
  };
}

// --- Badges & public profiles ------------------------------------------
// Typed against apps/badges and apps/users' public surface.

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";
export type BadgeMetric =
  | "current_streak"
  | "longest_streak"
  | "total_checkins"
  | "total_workouts"
  | "total_sets"
  | "rewards_earned";

export interface Badge {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  tier: BadgeTier;
  metric: BadgeMetric;
  threshold: number;
}

export interface UserBadge {
  id: string;
  badge: Badge;
  earned_at: string;
  is_featured: boolean;
}

// GET /me/badges/ -- every active badge, unlocked or not. user_badge is
// null for a locked one; current_value is always present (0..threshold)
// so the frontend can render a progress bar either way.
export interface BadgeProgress {
  badge: Badge;
  user_badge: UserBadge | null;
  current_value: number;
}

export interface PublicProfile {
  username: string;
  first_name: string;
  last_name: string;
  joined_at: string;
  gym_name: string | null;
  current_streak: number;
  longest_streak: number;
  featured_badges: UserBadge[];
  total_badge_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
}

export interface UserSearchResult {
  username: string;
  first_name: string;
  last_name: string;
}

export type ActivityType = "checkin" | "streak_milestone" | "badge_earned" | "workout_completed";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actor: UserSearchResult;
  summary: string;
  created_at: string;
}

// Typed against apps/notifications: GET /me/notifications/,
// GET /me/notifications/unread-count/, POST /me/notifications/{id}/read/,
// GET /push/vapid-public-key/, POST/DELETE /me/push-subscriptions/.

export type NotificationType =
  | "streak_milestone"
  | "reward_unlocked"
  | "reward_shipped"
  | "challenge"
  | "new_follower"
  | "system";

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface UnreadCountResponse {
  count: number;
}

export interface VapidPublicKeyResponse {
  public_key: string;
}

export interface RegisterPushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
}
