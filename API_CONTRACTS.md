# GymStreak — API Contracts & Application Flow

This document is the single reference for how GymStreak works end-to-end: every API endpoint's contract, the data models behind them, and how a request flows through the system from registration to claiming a physical reward.

It reflects the code as built. If this document and the code ever disagree, the code is right — but they should never disagree, since this was written directly against the current source.

---

## 1. Core principles

These rules are enforced in code, not just documentation, and apply across every app:

1. **The database is always the source of truth.** The client only ever supplies *evidence* (a scanned QR token, GPS coordinates, a claimed device). The server alone decides outcomes — verification status, streak counts, reward eligibility, inventory levels. Nothing the client asserts (`"streak": 100`, `"status": "verified"`) is ever trusted.
2. **Cached values are always fully derivable from an authoritative source, never hand-incremented.**
   - `UserStreak` is entirely recomputed from verified `CheckIn` rows.
   - `ProductVariant.stock` is entirely recomputed from the `InventoryTransaction` ledger.
   - Both have an explicit "rebuild from scratch" path (a management command / admin action) precisely because they're caches, not sources of truth.
3. **Business logic — including authorization — lives in `apps/<app>/services.py`.** Views and serializers stay thin: validate shape, call a service, shape the response. No service-layer logic in views, serializers, or custom DRF permission classes (this codebase has none).
4. **Secrets and high-entropy tokens are hashed at rest, shown in plaintext at most once.** Passwords, OTPs, device secrets, QR tokens, and reward redemption codes are never stored in recoverable form.
5. **Concurrency-sensitive operations use `select_for_update()` inside `transaction.atomic()`**, with a fixed, project-wide lock-ordering discipline to prevent deadlocks, and a savepoint/`IntegrityError`-catch pattern to make idempotent operations safe under real concurrent races.
6. **Every mutating, sensitive, or abuse-prone endpoint is rate-limited** via DRF `ScopedRateThrottle` (opt-in per view — see §8 for the full rate table). Plain reads are not throttled.
7. **Async jobs (Celery) are for non-critical side effects only, never request-determining logic.** Anything that decides what a response says — verification status, streak/reward computation — stays synchronous in the same transaction. A job that depends on a just-created row is scheduled via `transaction.on_commit()`, never fired before the row is actually committed, and every job is safe to run more than once (re-fetches its data by id; notification-creating jobs are backed by a DB-level `UniqueConstraint`, not just an in-app check). See §12.

---

## 2. Architecture

Modular Django monolith (no microservices). One Postgres database, one Redis instance (cache + Celery broker/result backend). Celery worker/beat run real background jobs as of this phase — see §12.

```
apps/
  common         shared UUID+timestamp base model, DRF exception envelope, pagination, health check, geo utility, provider-agnostic send_email()
  users          custom User model (email login), JWT auth, OTP infra, device tracking, profile
  gyms           gym records, staff membership/roles, check-in kiosk devices, dynamic QR token minting
  checkins       the verified check-in flow: QR redemption, geofencing, idempotency, duplicate prevention
  fraud          simple rule-based risk scoring + fraud-event audit log, feeds checkins and rewards
  streaks        cached UserStreak/StreakPolicy, fully rebuildable from verified CheckIn history
  rewards        streak-milestone RewardDefinitions, UserReward/RewardClaim lifecycle, Product/inventory ledger
  notifications  Notification inbox + provider-agnostic notify(), fed by Celery tasks off other apps' events
  challenges     admin-managed Challenge records (§16.10) -- no member-facing logic yet
  audit          AuditLog: the single write path for every admin/operations mutation (§16.11)
```

Every app above with an `admin_views.py`/`admin_serializers.py`/`admin_urls.py` also exposes an admin/operations API under `/api/v1/admin/` -- see §16 for the full surface (users, gyms, gym devices, check-ins, streaks, fraud, rewards, products, inventory, reward claims, shipping, challenges, audit logs).

Every concrete model inherits `apps.common.models.UUIDTimeStampedModel`: a UUID primary key (`id`, non-sequential, never exposes row counts) plus `created_at`/`updated_at`.

Every error response — regardless of which app raised it — is normalized by `apps.common.exceptions.custom_exception_handler` into:
```json
{"error": {"code": "bad_request", "message": "Human-readable message.", "details": { }}}
```
`code` is derived from the HTTP status (`bad_request`, `authentication_failed`, `permission_denied`, `not_found`, `method_not_allowed`, `throttled`, or `error` for anything else). `message` is a short, human-readable summary; `details` carries the raw DRF error shape (useful for field-level validation errors).

---

## 3. Authentication

JWT via `djangorestframework-simplejwt`. Every endpoint except `POST /register`, `POST /login`, `POST /password/forgot`, `POST /password/reset`, `POST /logout`, and `GET /health` requires:

```
Authorization: Bearer <access_token>
```

- Access token lifetime: 15 minutes (env-configurable). Refresh token lifetime: 7 days (env-configurable).
- Refresh tokens **rotate** on use and the old one is **blacklisted** — a used-up or logged-out refresh token can never be replayed.
- Login accepts optional `device_hash`/`platform` in the body and silently upserts a `UserDevice` row (used later for check-in fraud signals — see §6.3).
- Login/registration are **enumeration-safe**: wrong password and non-existent email return the identical generic error; `password/forgot` always returns the same generic 200 regardless of whether the email exists.

---

## 4. End-to-end application flow

This is the realistic order of operations for a new gym and a new member, tying every API section below into one story.

```
 PLATFORM SETUP (admin-only — Django admin, or the admin API of §16)
   1. Admin creates a Gym (location, geofence radius)
   2. Admin creates a GymMembership giving a user STAFF/MANAGER/OWNER at that gym
   3. Admin creates Product + ProductVariant rows and stocks them (InventoryTransaction RESTOCK)
   4. Admin creates RewardDefinition rows ("30-day streak -> hoodie", linked to a Product)
      (a default StreakPolicy row is auto-seeded by migration; admin may tune it)

 GYM STAFF ONBOARDING (API)
   5. POST /api/v1/gym-devices/            staff registers a check-in kiosk, gets a one-time secret
   6. GET  /api/v1/gym-devices/{id}/qr/    kiosk (or staff) polls this every <30s to display a fresh QR

 MEMBER LIFECYCLE (API)
   7. POST /api/v1/auth/register/                    create account
   8. POST /api/v1/auth/login/                        get JWTs (+ optionally register a device)
   9. POST /api/v1/auth/email/send-verification/      -> GET /api/v1/auth/email/verify/     (optional)
  10. GET/PATCH /api/v1/me/                            view/edit profile

 CHECK-IN LOOP (repeats daily/regularly)
  11. Member scans the kiosk's current QR code with their phone
  12. POST /api/v1/checkins/  {gym_id, qr_token, latitude, longitude, ...}
      -> server validates QR, expiry, gym match, replay, geofence, duplicate-per-day, fraud risk
      -> creates a CheckIn row with status verified / rejected / review
      -> IF verified: synchronously triggers a full UserStreak recompute
         -> which synchronously evaluates reward eligibility against the new streak
      -> on commit, ASYNC (Celery): fraud-review analysis, check-in analytics,
         and (if the streak hit a new all-time-high, or a reward was newly
         earned) STREAK_MILESTONE / REWARD_UNLOCKED notifications

 STREAK & PROGRESS (API, read-only)
  13. GET /api/v1/me/streak/       current/longest streak
  14. GET /api/v1/me/calendar/     which days were checked in, over a date range
  15. GET /api/v1/me/checkins/     raw check-in history

 REWARDS (API)
  16. GET /api/v1/rewards/                    browse available reward tiers + variant availability
  17. GET /api/v1/me/rewards/                 which rewards this user has earned/claimed
  18. POST /api/v1/rewards/{reward_def_id}/claim/   {variant_id, address}
      -> validates ownership, fraud/account status, locks + reserves inventory, creates a
         RewardClaim, returns a one-time redemption code
  19. (admin-only, §16) staff advance RewardClaim.status through PROCESSING -> SHIPPED -> DELIVERED,
      or CANCELLED (which releases the reserved inventory unit automatically) via
      POST /api/v1/admin/reward-claims/{id}/transition/
```

The two "synchronous cascade" points in step 12 are the architectural core of the app: **one verified check-in can, within the same request/transaction, ripple through streak recomputation and reward-eligibility evaluation**, so `GET /me/streak` and `GET /me/rewards` are always consistent with the check-in that was just recorded — there's no async delay, no eventual consistency, no background job to wait for.

```
CheckIn(status=VERIFIED) is created
        |
        v  (same transaction)
apps.streaks.services.rebuild_user_streak(user)
   - fully recomputes current_streak/longest_streak from ALL verified CheckIns
        |
        v  (same transaction)
apps.rewards.services.evaluate_rewards(user, streak)
   - for every ACTIVE RewardDefinition the user newly qualifies for,
     creates an EARNED UserReward (idempotent, never re-earned, never revoked)
```

This same `rebuild_user_streak` function is also called by the `rebuild_streaks` management command and an admin bulk action — there is exactly one streak-calculation code path in the entire system, so the cache can never drift from a partial/incremental update.

The fraud-review and notification steps above are the one deliberate exception to "no eventual consistency" (§7 of the core principles): they're non-critical side effects that don't gate the response, so they run off `transaction.on_commit()` in the Celery worker — typically sub-second locally, but not guaranteed to have happened by the time the HTTP response returns.

---

## 5. Health check

### `GET /health/`
Unversioned, unauthenticated. Checks DB and Redis connectivity.

**200** (healthy) or **503** (something's down):
```json
{"status": "ok", "database": "ok", "redis": "ok"}
```

---

## 6. `apps/users` — Auth & Profile

Base path: `/api/v1/auth/` (except `/api/v1/me/`, mounted at the top level).

### 6.1 `POST /api/v1/auth/register/`
AllowAny. Throttle: `10/hour` (per IP).

Request:
```json
{"email": "a@example.com", "password": "...", "first_name": "", "last_name": "", "phone": null}
```
`phone` optional (E.164-ish, 7–15 digits, optional leading `+`), validated against Django's standard password validators.

**201**:
```json
{"id": "<uuid>", "email": "a@example.com", "first_name": "", "last_name": "", "phone": null}
```
**400** if email/phone already registered, or password fails validation.

Registration does **not** auto-login — call `/login/` separately.

### 6.2 `POST /api/v1/auth/login/`
AllowAny. Throttle: `10/min` (per IP).

Request:
```json
{"email": "a@example.com", "password": "...", "device_hash": "optional", "platform": "ios|android|web|other"}
```
`device_hash`/`platform` optional — if given, upserts a `UserDevice` row (used later by check-in fraud scoring and reward fraud checks).

**200**:
```json
{"access": "<jwt>", "refresh": "<jwt>"}
```
**401** generic `"No active account found with the given credentials"` for both wrong password and unknown email (enumeration-safe).

### 6.3 `POST /api/v1/auth/refresh/`
AllowAny. Throttle: `60/min`.

Request: `{"refresh": "<jwt>"}` → **200** `{"access": "<jwt>", "refresh": "<jwt>"}` (refresh token rotates). **401** if blacklisted/expired/invalid.

### 6.4 `POST /api/v1/auth/logout/`
AllowAny (no access token required — you can log out with an expired access token). Throttle: `30/min`.

Request: `{"refresh": "<jwt>"}` → **200** `{}`. Blacklists that refresh token permanently.

### 6.5 `POST /api/v1/auth/email/send-verification/`
IsAuthenticated. Throttle: `3/hour` (per user) + a 60-second resend cooldown enforced via cache.

No body. **200** `{"message": "Verification email sent."}`. **400** if already verified, or cooling down.

Generates a 6-digit numeric code (`secrets`-random, hashed with `make_password` at rest) and, on commit, dispatches it via an async Celery task (`send_otp_email_task`, console backend in dev) — expires in 10 minutes, max 5 verify attempts. The code itself is never logged: Celery's INFO-level trace logs show task name/id/runtime and (on success) the task's return value only, and this task always returns `None`; only the transient broker message ever carries the plaintext code, and only `OTP.code_hash` is ever persisted.

### 6.6 `POST /api/v1/auth/email/verify/`
IsAuthenticated. Throttle: `10/hour`.

Request: `{"code": "123456"}` → **200** `{"message": "Email verified."}`. **400** generic "Invalid or expired code." (also covers wrong code / exceeded attempts / expired — no distinction given to the client).

### 6.7 `POST /api/v1/auth/password/forgot/`
AllowAny. Throttle: `5/hour`.

Request: `{"email": "..."}` → **always 200**, same message regardless of whether the account exists:
```json
{"message": "If an account exists for this email, a reset code has been sent."}
```
Same async dispatch as §6.5 when the account exists (no-op, still 200, if it doesn't).

### 6.8 `POST /api/v1/auth/password/reset/`
AllowAny. Throttle: `10/hour`.

Request: `{"email": "...", "code": "123456", "new_password": "..."}` → **200** `{"message": "Password has been reset."}`. **400** generic "Invalid or expired code." for any failure (unknown email included — doesn't distinguish "no such account" from "wrong code").

On success: **every outstanding refresh token for that user is blacklisted** (log out everywhere) — access tokens already issued remain valid until their own 15-minute expiry.

### 6.9 `GET /api/v1/me/`
IsAuthenticated.

**200**:
```json
{
  "id": "<uuid>", "email": "a@example.com", "first_name": "", "last_name": "",
  "phone": null, "email_verified": false, "phone_verified": false,
  "is_staff": false,
  "created_at": "2026-01-01T00:00:00Z",
  "gym": {"id": "<uuid>", "name": "Gym A"}
}
```
`gym` is the user's `MEMBER`-role `GymMembership` (set at registration via `gym_id` — see §6.1), or `null` if they registered without one. `null` for the empty-directory bootstrap case, or if a future flow ever supports registering without a gym.

`is_staff` is exposed here so a client can gate its own admin-only UI (e.g. show/hide an "Admin" link) — it carries no authorization weight itself; every admin endpoint still independently checks `IsStaffUser` server-side (§16.1), so this field can never be the actual security boundary, only a UI convenience.

### 6.10 `PATCH /api/v1/me/`
IsAuthenticated.

Request (all fields optional): `{"first_name": "...", "last_name": "...", "phone": "..."}`. Email is **not** editable here (would need its own re-verification flow, not built). Changing `phone` resets `phone_verified` to `false`.

**200**: the updated fields (`first_name`, `last_name`, `phone`).

---

## 7. `apps/gyms` — Gyms, Staff, Check-in Devices, Dynamic QR

### 7.1 `GET /api/v1/gyms/`
AllowAny — has to be browsable before an account exists, for the registration gym-picker. Paginated (`page`, `page_size`, default page size 20).

**200**:
```json
{
  "count": 1, "next": null, "previous": null,
  "results": [{
    "id": "<uuid>", "name": "Gym A", "description": "", "address": "1 Main St",
    "city": "NYC", "state": "", "country": "US", "postal_code": "",
    "latitude": "40.712800", "longitude": "-74.006000",
    "checkin_radius_meters": 100, "status": "active",
    "created_at": "...", "updated_at": "..."
  }]
}
```
Only `status=active` gyms are ever listed (never `pending`/`rejected`/`inactive` — same filter on the detail view, §7.2).

`POST /api/v1/gyms/` — IsAuthenticated, throttled (`gym_create`: 10/hour). Self-service: any authenticated user can create a gym and immediately becomes its `OWNER` (a `GymMembership`, `apps.gyms.services.create_owned_gym`), but the gym itself starts `status=pending` — invisible everywhere member-facing (this endpoint's own `GET`, the detail view, the register gym-picker) until a platform staff user approves or rejects it via the admin API (§16.3) or the Django admin "Approve/Reject selected pending gyms" bulk actions — both call the same `apps.gyms.services.admin_approve_gym`/`admin_reject_gym`, so the two surfaces can't drift. Request body: `{"name", "address", "city", "country", "latitude", "longitude", "description"?, "state"?, "postal_code"?, "checkin_radius_meters"?}` → **201** with the created (`pending`) gym.

Gyms can also be created directly by platform admins — via Django admin, or `POST /admin/gyms/` (§16.3) — which go straight to `active`, no review step (an admin creating a gym themselves doesn't need to approve their own gym). Staff memberships for gyms are always admin-assigned, via Django admin or `/admin/gym-memberships/` (§16.3).

### 7.2 `GET`/`PATCH /api/v1/gyms/{id}/`
`GET`: AllowAny (same reasoning as list above). Same shape as one item above. **404** if not found or `status=inactive`.

`PATCH`: IsAuthenticated + **gym `OWNER` only** at that specific gym (`apps.gyms.services.update_own_gym`) — the caller's own gym profile self-edit. Same body shape as `POST /gyms/` (§7.1), any subset, `status` excluded (approval stays admin-only, §16.3). Unlike `GET`, reachable even while the gym is still `pending`, so an owner can fix details before approval. **403** if the caller isn't that gym's `OWNER`.

### 7.3 `POST /api/v1/gym-devices/`
IsAuthenticated + **gym staff only** (an `ACTIVE` `GymMembership` with role `STAFF`/`MANAGER`/`OWNER` at *that specific* gym — checked in `apps.gyms.services.assert_gym_staff`, not a DRF permission class). Throttle: `10/hour`.

Request: `{"gym": "<gym_uuid>", "name": "Front Desk Kiosk"}`.

**201**:
```json
{
  "id": "<uuid>", "gym": "<gym_uuid>", "name": "Front Desk Kiosk",
  "device_code": "dev_a1b2c3d4e5f60718", "status": "active",
  "last_rotation_at": "...", "created_at": "...", "updated_at": "...",
  "secret": "<plaintext, shown only in this response>"
}
```
The `secret` is generated fresh, hashed at rest (`make_password`), and **never retrievable again**. It has no functional role in this phase (create/rotate/QR are all staff-JWT-authenticated, not device-authenticated) — it's forward-compatible infrastructure for a future direct-device-auth phase.

**403** `"You do not have staff access to this gym."` if the caller isn't staff at the named gym (checked per-gym, not "staff anywhere").

### 7.4 `POST /api/v1/gym-devices/{id}/rotate/`
Same staff-only authorization, scoped to the device's own gym. Throttle: `10/hour`.

**200**: same shape as create, with a freshly-generated `secret` (old one invalidated). **Also immediately revokes every still-`ACTIVE` `CheckinSession` for that device** — any QR code currently on display becomes unusable the instant rotation happens (a compromised-device response mechanism).

### 7.5 `GET /api/v1/gym-devices/{id}/qr/`
Same staff-only authorization. Throttle: `10/min` (generous — a kiosk/staff display polls this faster than the QR's TTL to keep it fresh).

**200**:
```json
{"token": "<opaque signed token>", "expires_at": "2026-01-01T00:00:30Z", "gym_id": "<uuid>", "device_id": "<uuid>"}
```
**400** `"This check-in device is disabled."` if the device's `status` is `disabled`.

Mints a **brand-new** `CheckinSession` on every call (no reuse of a still-valid one). `token` is what a real client would encode into a scannable QR image — this API returns the raw string, not a rendered image.

**QR token design**: a `secrets.token_urlsafe(32)` random value (256 bits), signed with `django.core.signing.Signer` (HMAC via `SECRET_KEY`), giving a signature that lets bad input be rejected cheaply before any DB lookup. The payload carries **no embedded gym/device/session id** — pure opaque random + signature. Only `sha256(raw_value)` is stored server-side as `token_hash` (deterministic hash — required for O(1) lookup-by-value, unlike a slow salted password hash). TTL: **30 seconds** (`CHECKIN_QR_TTL_SECONDS`).

### 7.6 Gym self-service management

Everything below is IsAuthenticated + gated by the caller's own `GymMembership` role at that specific gym (`apps.gyms.services.assert_gym_role`/`assert_can_manage_role`) — **not** platform-admin (`IsStaffUser`, §16). Permission matrix: `OWNER` — edit profile (§7.2), manage staff of any role (invite/change/remove, including other owners/managers), remove plain members. `MANAGER` — invite/change/remove `STAFF`-role people only; can't touch `OWNER`/`MANAGER` assignments or the profile; can remove plain members. `STAFF` — view-only here, plus the device endpoints above (§7.3–7.5, already staff-tier-gated). All three tiers can view the roster and staff list; both member lists are scoped to `status=active` (a removed row drops out, not just gets a status label).

| Endpoint | Purpose |
|---|---|
| `GET /gyms/{id}/members/` | Paginated roster — `GymMembership` rows with `role=member`, `status=active` at this gym (who registered here as their home gym, §6.1). Any staff tier. |
| `GET /gyms/{id}/members/{membership_id}/` | One member's detail: the roster row plus `streak` (`UserStreak` snapshot, §9.1's shape) and `recent_checkins` (their last 15 `CheckIn` rows **at this gym**, §8.1's shape). Composed in `apps.checkins.services.get_gym_member_detail` rather than `apps.gyms` — it needs to read `UserStreak`/`CheckIn`, both of which already depend on `apps.gyms`; the reverse import would be circular. Any staff tier. |
| `DELETE /gyms/{id}/members/{membership_id}/` | Removes a plain member (`GymMembership.status → inactive`, not a hard delete — same shape as staff removal below). `OWNER`/`MANAGER` only, not `STAFF`. |
| `GET /gyms/{id}/devices/` | This gym's `GymCheckinDevice` rows (same shape as §7.3's create response, minus `secret`). The one gap the already-built device/QR system had — creation/rotation/QR minting (§7.3–7.5) worked per-gym from day one; listing didn't. |
| `GET /gyms/{id}/staff/` | Roster of `STAFF`/`MANAGER`/`OWNER` memberships at this gym. |
| `PATCH /gyms/{id}/staff/{membership_id}/` | `{"role": "staff"\|"manager"\|"owner"}` — change an existing staff member's role. Checked against **both** their current role and the target role, so a `MANAGER` can't use this to promote someone into `MANAGER`/`OWNER`. Refuses to leave a gym with zero `ACTIVE` `OWNER`s. |
| `DELETE /gyms/{id}/staff/{membership_id}/` | Removes a staff member (`GymMembership.status → inactive`, not a hard delete). Same role-matrix + last-owner guard as `PATCH` above. **204**. |
| `GET`/`POST /gyms/{id}/staff-invites/` | List pending/past invites for this gym, or create one: `{"email": "...", "role": "staff"\|"manager"\|"owner"}`. Throttle (`POST`): `20/hour`. Emails the invitee an accept link (`{FRONTEND_URL}/staff-invites/{token}`) — works even if they have no account yet; nothing is auto-created until they explicitly accept. |
| `POST /gyms/{id}/staff-invites/{invite_id}/revoke/` | Only from `pending`. Same role-matrix as creating. |
| `GET /staff-invites/{token}/` | AllowAny — the token itself is the bearer credential (same trust model as the check-in QR token above). Returns `{"gym": {...}, "email", "role", "expires_at"}` for a "you're invited" preview page. **404**/**400** if the token is unknown/expired/already used/revoked. |
| `POST /staff-invites/{token}/accept/` | IsAuthenticated (no role gate — anyone logged in can call it, but see below). Throttle: `20/hour`. Requires the **caller's own email to match the invited email** exactly — this, not the role matrix, is the actual security boundary; knowing the token alone doesn't let a different logged-in user accept someone else's invite (**403** otherwise). On success: `update_or_create`s the `GymMembership` (mirrors `admin_assign_membership`, §16.3) and marks the invite `accepted`. |

Registration is deliberately **not** invite-aware — accepting always requires being logged in first (register or log in normally, then accept). Keeps the invite flow fully decoupled from `POST /auth/register/`.

---

## 8. `apps/checkins` — The Verified Check-in Flow

### 8.1 `POST /api/v1/checkins/`
IsAuthenticated. Throttle: `20/hour` (per user).

**Request:**
```json
{
  "gym_id": "<uuid>",
  "qr_token": "<opaque signed token from the kiosk's current QR>",
  "latitude": 40.712800,
  "longitude": -74.006000,
  "location_accuracy": 10,
  "device_hash": "optional, member's own phone",
  "platform": "optional: ios|android|web|other"
}
```
Optional header: `Idempotency-Key: <any client-generated string>` — a retried request with the same key returns the exact same result instead of creating a second row, even under real concurrency.

**Response — always HTTP 201 for a newly-created attempt (200 for an idempotent replay), regardless of whether the check-in was verified or rejected.** The resource — the check-in *attempt record* — was successfully created either way; `status` in the body carries the actual outcome. This is deliberate: it's the literal embodiment of "the backend decides validity," not the transport layer.

```json
{
  "id": "<uuid>", "gym": "<uuid>", "status": "verified",
  "verification_method": "qr", "checked_in_at": "...", "created_at": "...",
  "message": "Check-in verified."
}
```
`status` is one of `pending` (never actually persisted by this flow — reserved for future async paths) / `verified` / `rejected` / `review`. **`risk_score` and any fraud-event detail are never included in the response** — exposing the numeric score would hand an attacker a tuning oracle.

**The only 400 here is malformed input** (missing fields, or `gym_id` that doesn't resolve to an active `Gym`) — everything else, including every QR/location/fraud failure, is a 201 with `status: "rejected"`.

**Ordered validation flow, exactly as executed:**

| Step | Check | On failure |
|---|---|---|
| 1 | Rate limit | 429 |
| 2 | QR signature valid, token resolves to a known `CheckinSession` | `rejected`, "This QR code is not valid." |
| 3 | Session not expired | `rejected`, "This QR code has expired." |
| 4 | Session's gym matches the claimed `gym_id` | `rejected`, "This QR code does not belong to the selected gym." + `FraudEvent(suspicious_pattern)` — **session is NOT consumed**, still usable with the correct gym |
| 5 | Session not already used, kiosk device not disabled | `rejected`, "already used" + `FraudEvent(qr_reuse)`, or "device is disabled" | 
| — | **Session is burned here** (`status=consumed`) — before location is even checked, closing a retry-oracle where an attacker could keep retrying spoofed GPS against a still-valid code | |
| 6 | Distance to gym ≤ `gym.checkin_radius_meters + min(location_accuracy, 50m)` | `rejected`, "too far" + `FraudEvent(gps_mismatch)` |
| 7 | No existing `verified` check-in at this gym today (UTC) | `rejected`, "already checked in today" + `FraudEvent(too_many_checkins)` |
| 8 | Simple rule-based risk score computed (see §9) | score ≥ 60 → `status="review"`; else `status="verified"` |

On a `verified` outcome only, this same transaction synchronously calls `rebuild_user_streak` → `evaluate_rewards` (§10, §11).

### 8.2 `GET /api/v1/me/checkins/`
IsAuthenticated. Paginated, newest first.

**200**: list of the same shape as the create response minus `message`, i.e. `{id, gym, status, verification_method, checked_in_at, created_at}` for every check-in the caller has ever attempted (including rejected ones).

---

## 9. `apps/fraud` — Risk Scoring & Fraud Review

Risk scoring itself isn't exposed via HTTP — it's services called from the check-in and reward flows. Reviewing/resolving what those services flag IS exposed, via Django admin and the admin API (§16.6). Simple, explainable, additive rules everywhere — **no ML**. Two distinct, deliberately separate assessments live here, answering different questions:

### 9.1 `score_checkin` — is THIS ONE check-in suspicious?

Called once per check-in attempt, feeds `CheckIn.risk_score` (§8.1 step 8).

| Signal | Trigger | Weight |
|---|---|---|
| `device_anomaly` | No `device_hash` supplied at all | 15 |
| (unlogged, score-only) | GPS accuracy worse than 30m but still inside the hard geofence | 10 |
| `impossible_travel` | Verified check-in at a different gym implying >900 km/h travel speed since the last one | 60 (alone enough to force `review`) |
| `multiple_accounts_device` | This `device_hash` is linked to a *different* user's `UserDevice` | 25 |
| `too_many_checkins` | ≥5 check-in attempts (any status) by this user in the last 60 minutes | 20 |
| `suspicious_pattern` | ≥3 `rejected` attempts by this user in the last 60 minutes | 25 |

Score capped at 100. **≥60 → `status="review"`. Risk score alone can never produce `rejected`** — only the hard gates in §8's table do that.

### 9.2 `assess_user` / `assess_and_flag` — is THIS USER, overall, currently risky?

A rolling-window assessment over a user's full history, conceptually "FraudRiskService" (implemented as plain functions — this codebase has no class-based services anywhere). Returns `LOW`/`MEDIUM`/`HIGH`, called after **every** check-in outcome (rejected attempts count too — "repeated failed check-ins" is one of the signals).

Reads recent (30-day) `FraudEvent` counts per type, weighted:

| Event type | Weight | Source |
|---|---|---|
| `qr_reuse` | 20 | already logged reactively by the check-in flow |
| `gps_mismatch` | 10 | ″ |
| `too_many_checkins` | 15 | ″ |
| `impossible_travel` | 30 | ″ |
| `multiple_accounts_device` | 25 | ″ |
| `suspicious_pattern` | 15 | ″ |
| `device_anomaly` | 10 | ″ |
| `suspicious_account_creation` | 40 | **live-computed**: ≥3 other users share a device with this one, all created within 48h of each other (an account-farming burst) |
| `suspicious_reward_claim` | 40 | **live-computed**: ≥3 other device-sharing users also have a `RewardClaim` (a claim-farming ring) |

Score capped at 100. `<30` LOW, `30-59` MEDIUM, `≥60` HIGH — separate thresholds/scale from §9.1's per-check-in score (a different question, tuned independently).

**The only automatic consequence of a `HIGH` result is opening a `FraudReview`** (`status=open`) for human attention — nothing about account state or claim eligibility changes automatically. At most one `open` review exists per user at a time (`ensure_open_review` is idempotent).

### 9.3 Admin fraud workflow

Every action below has two equivalent entry points sharing one code path in `apps.fraud.services` — Django admin and the admin API (§16.6) — plus the `django.contrib.admin.models.LogEntry` Django admin gets for free, both now also write an `apps.audit.AuditLog` row (§16.11).

- **`FraudEventAdmin`** — read-only audit log (as before), plus a bulk action **"Create fraud review from selected events"** (all selected events must belong to one user) that opens/reuses a review and links the events to it. Delegates to `apps.fraud.services.create_review_from_events`.
- **`FraudReviewAdmin`** — `status` (`open`/`approved`/`rejected`) and `resolution_notes` are editable; everything else read-only. `approved` = the flagged concern is confirmed valid; `rejected` = dismissed as a false positive. Bulk **"Approve selected"**/**"Reject selected"** actions, or edit `status` directly — both paths delegate to `apps.fraud.services.resolve_review`, which stamps `resolved_at`/`resolved_by` and rejects any transition other than `open → approved`/`open → rejected`. Admin can also directly **add** a `FraudReview` (`status=open, risk_level=high`) for any user — this is the mechanism behind "blocking reward claims" (§11.5's `block_if_high_risk_review` gate respects it exactly the same as an automated one).
- **`UserAdmin`** bulk action **"Block reward claims for selected users"** — a one-click convenience that does exactly the above (`apps.fraud.services.block_reward_claims`, which calls `ensure_open_review(..., risk_level=HIGH)`).
- **Suspending/restoring users** — the `is_active` field, already fully enforced: `rest_framework_simplejwt.authentication.JWTAuthentication.get_user()` re-checks `is_active` on **every** authenticated request (not just at login), so flipping it immediately locks a user out even with a still-valid, unexpired access token. The admin API path (`apps.users.services.set_user_active`, §16.2) additionally blacklists every outstanding refresh token on suspend.
- **Audit**: every ordinary single-object add/change (`UserAdmin`, `FraudReviewAdmin`) gets a `LogEntry` for free via Django's default `save_model`. The custom bulk actions and every admin-API mutation across the whole system write to the single `AuditLog` table instead (§16.11) — a `LogEntry` is Django-admin-only and per-app, `AuditLog` is the one cross-app, API-queryable record.

---

## 10. `apps/streaks` — Streak Engine

### 10.1 `GET /api/v1/me/streak/`
IsAuthenticated.

**200**:
```json
{"current_streak": 7, "longest_streak": 12, "last_activity_date": "2026-08-30", "updated_at": "..."}
```
Served straight from the cached `UserStreak` row (auto-created with zeros on first read for a user who's never checked in) — never recomputed on read, since the write-side hook (§4) is the only place `CheckIn.status` is ever set to `verified`, and it always keeps this cache current.

### 10.2 `GET /api/v1/me/calendar/`
IsAuthenticated. Query params: `start`, `end` (ISO dates, both optional — default: trailing 90 days ending today; max span 366 days).

**200**:
```json
{
  "range": {"start": "2026-06-02", "end": "2026-08-31"},
  "streak": {"current_streak": 7, "longest_streak": 12, "last_activity_date": "2026-08-30"},
  "days": [
    {"date": "2026-08-30", "checked_in": true, "checkin_count": 1, "gym_ids": ["<uuid>"]},
    {"date": "2026-08-29", "checked_in": false, "checkin_count": 0, "gym_ids": []}
  ]
}
```
One entry per calendar day in range, dense (every day present, checked-in or not). Uses the same "gym day" attribution (see below) as the streak calculator, so this view is always self-consistent with `/me/streak`.

### 10.3 Streak calculation — how `current_streak`/`longest_streak` are actually computed

**Never incremented.** Every trigger (a live check-in, the `rebuild_streaks` management command, an admin bulk action) calls the exact same function, `apps.streaks.services.rebuild_user_streak`, which:
1. Locks the user's `UserStreak` row (`select_for_update()`).
2. Pulls **every** verified `CheckIn.checked_in_at` for that user.
3. Converts each to a "gym day": `(checked_in_at - grace_period_minutes).date()`, UTC — a check-in a few minutes past midnight still counts for the prior day, avoiding an unfair break from network/processing latency.
4. Runs a pure function (`apps.streaks.calculator.calculate_streak`, no DB access) over the sorted, deduplicated list of gym-days against the active `StreakPolicy`.

**`StreakPolicy`** (a DB-backed singleton, admin-editable, one default row auto-seeded by migration):
| Field | Meaning | Default |
|---|---|---|
| `allowed_rest_days` | Max size of any single gap (in days) that doesn't break a streak run | 1 |
| `freeze_count` | Max *number* of such gaps tolerated within one continuous run (not a depleting per-user balance — recomputed fresh every time) | 2 |
| `grace_period` | Minutes shifting the UTC day boundary (see step 3 above) | 120 |
| `minimum_days_per_week` | Anti-gaming: within any 7-day trailing window inside a run, at least this many distinct check-in days are required, or the run breaks there | 2 |

`longest_streak` = the longest calendar-day span (inclusive) among all such runs, ever. `current_streak` = the most recent run's span, **but only if it's still "alive" relative to today** (a virtual test of whether today's gap from the last check-in would itself have been tolerated) — otherwise `0`, even though `longest_streak` and `last_activity_date` still reflect history.

### 10.4 `rebuild_streaks` management command (internal/admin operation)
```bash
python manage.py rebuild_streaks [--user-id <uuid>]
```
Recomputes one user's streak (or every user with ≥1 verified check-in) from scratch. Also available as a "Rebuild selected streaks" bulk action on `UserStreak` in Django admin. Use after changing `StreakPolicy`, or to repair any suspected drift — there's nothing this can't reconstruct, since streak state is always fully derivable from `CheckIn`.

---

## 11. `apps/rewards` — Rewards & Merchandise

Financially sensitive (physical merchandise). Eligibility is *always* computed server-side; a claim can never be created from a client-asserted streak value.

### 11.1 `GET /api/v1/rewards/`
IsAuthenticated. Paginated. `status=active` reward tiers only.

**200**:
```json
{
  "count": 1, "next": null, "previous": null,
  "results": [{
    "id": "<uuid>", "name": "30-Day Streak Hoodie", "description": "",
    "reward_type": "merchandise", "required_streak": 30, "terms": "",
    "variants": [{"id": "<uuid>", "size": "M", "in_stock": true}],
    "created_at": "..."
  }]
}
```
`in_stock` is a boolean only — the raw stock count is never exposed to clients (same "don't hand out a tuning oracle" reasoning as omitting `risk_score`). `variants` is how a client discovers a valid `variant_id` to send at claim time — there's no separate products endpoint.

### 11.2 `GET /api/v1/rewards/{id}/`
Same shape as one item above. **404** if not found or `status=inactive`.

### 11.3 `GET /api/v1/me/rewards/`
IsAuthenticated. Paginated, newest-earned-first.

**200**:
```json
{
  "results": [{
    "id": "<uuid>",
    "reward_definition": { "...same shape as §11.1..." },
    "status": "earned", "earned_at": "...", "claimed_at": null
  }]
}
```
`status`: `earned` → `claimed` → `processing` → `shipped` → `delivered`, or `cancelled` at any point (admin-driven after claiming).

### 11.4 `GET /api/v1/me/rewards/{id}/`
`{id}` is the **`UserReward`'s own id** (not the reward definition's — contrast with §11.5). Ownership-scoped: **404** (not 403) if the id exists but isn't the caller's — a plain "not in your collection" case, same idiom as every other `/me/*` endpoint.

**200**: same as one list item above, plus a nested `claim` (`null` until claimed):
```json
{
  "...": "...",
  "claim": {
    "id": "<uuid>", "variant": "<uuid>", "shipping_address": {"...": "..."},
    "tracking_number": "", "carrier": "", "status": "claimed",
    "created_at": "...", "updated_at": "..."
  }
}
```

### 11.5 `POST /api/v1/rewards/{id}/claim/`
`{id}` is the **`RewardDefinition`'s id** — "claim reward tier X," not needing to know your own internal `UserReward` id. IsAuthenticated. Throttle: `10/hour`.

Request:
```json
{
  "variant_id": "<uuid>",
  "address": {
    "name": "Jane Doe", "line1": "1 Main St", "line2": "",
    "city": "NYC", "state": "NY", "postal_code": "10001", "country": "US",
    "phone": ""
  }
}
```
`address` required fields: `name`, `line1`, `city`, `postal_code`, `country`. Optional: `line2`, `state`, `phone`.

**201** (newly created):
```json
{
  "id": "<uuid>", "variant": "<uuid>", "shipping_address": {"...": "..."},
  "tracking_number": "", "carrier": "", "status": "claimed",
  "created_at": "...", "updated_at": "...",
  "redemption_code": "<plaintext, shown exactly once, ever>"
}
```
**200** (idempotent replay — the same `UserReward` already has a claim; no key needed, the reward's own identity is the natural idempotency key): identical body, **`redemption_code` key omitted**.

**Error responses:**

| Condition | Status | Message |
|---|---|---|
| No `EARNED` `UserReward` for this definition + caller | 403 | "You have not earned this reward." |
| Reward's `UserReward.status` is `cancelled` (terminal) | 400 | "This reward is no longer available to claim." |
| `variant_id` doesn't exist | 400 | "Invalid variant." |
| `variant_id` exists but belongs to a different product than this reward | 400 | "This variant is not available for this reward." |
| Variant's `stock` is 0 | 400 | "This item is currently out of stock." — `UserReward` stays `earned`, retryable with a different size |
| `user.is_active` is false, or (if the tier has `block_if_high_risk_review=True`) the user has an `open` `FraudReview` at `risk_level=high` | 403 | "Your account is not eligible to claim rewards at this time." (deliberately generic — doesn't reveal which check tripped, see §9.3 for how a review gets there) |
| Tier has `require_email_verified=True` and `user.email_verified` is false | 403 | "Please verify your email address before claiming this reward." |
| Tier has `require_phone_verified=True` and `user.phone_verified` is false | 403 | "Please verify your phone number before claiming this reward." |
| Tier has `minimum_account_age_days` and the account is younger | 403 | "Your account is too new to claim this reward yet." |
| Tier has `minimum_verified_checkins` and the user has fewer | 403 | "You need more verified check-ins to claim this reward." |

The last 4 gates are per-reward-tier opt-in (`RewardDefinition` fields, all off by default) — unlike the fraud/active checks, these get specific, actionable messages since they're not fraud-sensitive: telling a legitimate user what they still need to do is helpful UX, not an information leak.

**Reward code**: `secrets.token_urlsafe(32)` plaintext, `sha256` hash stored on `UserReward.claim_code_hash` — same reasoning as the QR token (high-entropy bearer credential, no slow hashing needed). Generated at **claim time**, not earn time (earning happens asynchronously off a streak recompute, with no request/response cycle to return anything in).

**Concurrency, verified live against the actual running system:**
- *Same user, same reward, two near-simultaneous requests* (double-click / retry): the `UserReward` row lock serializes them — the second request blocks, then sees the already-committed claim and returns it. Exactly one `InventoryTransaction(reserve)` row is ever created.
- *Two different users, last unit of the same variant*: their `UserReward` rows never contend, so both proceed to lock `ProductVariant` — whichever gets there first reserves the unit; the other sees `stock=0` and gets the out-of-stock error. Stock never goes negative.
- Lock ordering is fixed project-wide: always `UserReward` before `ProductVariant`, inside one transaction spanning through claim creation — this is what rules out deadlock between the two race shapes above.

### 11.6 Reward eligibility (internal, no public API)

`apps.rewards.services.evaluate_rewards(user, streak)` — called automatically inside `rebuild_user_streak` (§10.3), every time, for every user. For each `ACTIVE` `RewardDefinition` where `required_streak <= current_streak`, creates an `EARNED` `UserReward` if one doesn't already exist. **Idempotent and one-way**: a reward is earned at most once per user, ever, and is never revoked even if the streak later drops below the threshold.

### 11.7 Inventory ledger (internal, no public API)

`ProductVariant.stock` is a cache; `InventoryTransaction` is the append-only ledger of record.

| Type | Quantity sign | When |
|---|---|---|
| `restock` | positive | Admin/service adds stock |
| `reserve` | −1 | A claim reserves a unit (the only point stock decreases) |
| `release` | +1 | A claim is cancelled — its unit returns to available stock |
| `ship` | 0 | Pure status marker — stock already moved at `reserve` time; there's no separate "reserved-but-not-shipped" counter |
| `adjustment` | either | Manual admin correction (damaged/lost/found goods, audit reconciliation) — always requires a `reason`. See §16.9. |

`apps.rewards.services.rebuild_variant_stock(variant)` recomputes `stock` as the literal sum of that variant's ledger — an audit/repair path, mirroring the streak engine's rebuild, exposed as a "Rebuild stock" admin action on `ProductVariant`.

### 11.8 Fulfillment (admin-only — Django admin, or the admin API of §16.8)

Staff advance a `RewardClaim`'s `status` (`claimed` → `processing` → `shipped` → `delivered`, or `cancelled`) and set `tracking_number`/`carrier` either directly in Django admin or via `POST /api/v1/admin/reward-claims/{id}/transition/`. Both paths go through the single fulfillment state-machine service, `apps.rewards.services.transition_claim_status` — see §16.8 for the full transition table and endpoint contract. `UserReward.status` is kept mirrored automatically. Cancelling releases the reserved inventory unit (a `release` transaction) and is only reachable before a unit has shipped — this is terminal, no re-claim path exists in this phase. Transitioning into `shipped` fires an async `REWARD_SHIPPED` notification (§12) via `transaction.on_commit()`, and also records a `ship`-typed `InventoryTransaction` (quantity 0) so the ledger shows exactly when each unit shipped.

---

## 12. `apps/notifications` — In-App Notifications & Background Jobs

A provider-agnostic in-app inbox. Notifications are never written to directly by other apps — they're created by Celery tasks in `apps/notifications/tasks.py`, triggered off other apps' events via `transaction.on_commit()` (including the admin-driven shipped transition — see §16.8).

### 12.1 `GET /api/v1/me/notifications/`
IsAuthenticated. Paginated, newest-first. Unthrottled (plain read).

**200**:
```json
{
  "count": 2, "next": null, "previous": null,
  "results": [{
    "id": "<uuid>", "type": "reward_unlocked",
    "title": "Reward unlocked!", "message": "You've unlocked 30-Day Streak Hoodie.",
    "read_at": null, "created_at": "..."
  }]
}
```
`type` is one of `streak_milestone` / `reward_unlocked` / `reward_shipped` / `challenge` / `system`. `challenge` is reserved (no `apps/challenges` feature exists yet to produce one) and `system` has no automated producer this phase — both are valid enum values a future phase or an admin can use.

### 12.2 `POST /api/v1/me/notifications/{id}/read/`
IsAuthenticated. Unthrottled — an idempotent mark-read, same bar as `/me/rewards/{id}` reads.

**200**: the notification, with `read_at` set to now if it wasn't already, unchanged if it was (a second call is a safe no-op, still 200 — not a 400/409). **404** if `{id}` doesn't exist or isn't the caller's — same ownership idiom as every other `/me/*` detail endpoint.

### 12.3 Notification-producing events (internal, no public API)

| Trigger | Task | Dedup key |
|---|---|---|
| A streak recompute produces a new all-time-high `longest_streak` | `send_streak_milestone_notification` | None — guarded at the call site (only scheduled when `result.longest_streak > previous_longest`), not inside the task, since `UserStreak` is a singleton per user and can't itself be the dedup key for "which personal best was this" |
| A `RewardDefinition` is newly earned (`evaluate_rewards`) | `send_reward_unlocked_notification` | `(user, REWARD_UNLOCKED, "userreward", user_reward.id)` |
| A `RewardClaim` transitions into `shipped` in admin | `send_reward_shipped_notification` | `(user, REWARD_SHIPPED, "rewardclaim", claim.id)` |

Every task re-fetches its row by id (never trusts serialized task args to still be current) and is a safe no-op if that row is already gone. Reward-related tasks route through `apps.notifications.services.notify(..., related_object=...)`, which does a `get_or_create` against the model's `UniqueConstraint` on `(user, type, related_object_type, related_object_id)` — so a task retried by Celery (at-least-once delivery) never produces a duplicate notification, verified live by re-invoking a task twice for the same id.

### 12.4 Other background jobs (internal, no public API)

| Job | Fires on | Notes |
|---|---|---|
| `send_otp_email_task` | Email-verification / password-reset OTP requested | §6.5. Content-building lives in the task, not the caller — the caller never has the email body in scope. |
| `send_email_task` | Available for any future plain outbound email | Thin wrapper around `apps.common.email.send_email` — the one place any outbound email in the system calls Django's `send_mail`; this is the "provider-agnostic" swap point. |
| `assess_and_flag_task` | Every check-in outcome (§9.2) | Re-fetches the user, calls the unchanged `apps.fraud.services.assess_and_flag` — already idempotent via `ensure_open_review`'s existing-open-review check. |
| `record_checkin_analytics` | Every check-in outcome | Logs one structured line (`status`, `gym_id`, `verification_method`) via the app logger. Deliberately minimal/demonstrative — proves the wiring exists; no analytics pipeline exists in this project yet. |

Leaderboard recalculation is **not** built this phase — no leaderboard feature exists anywhere in this codebase to recalculate. Left as a natural future extension of this same `on_commit`-triggered-task pattern.

### 12.5 Admin

`NotificationAdmin` — fully read-only (no add/change permission), audit visibility into what a user was notified about and when. Same pattern as `CheckInAdmin`/`OTPAdmin`.

---

## 13. Data model reference

All models below inherit `id` (UUID), `created_at`, `updated_at` from `UUIDTimeStampedModel` unless noted.

| Model | App | Key fields | Notes |
|---|---|---|---|
| `User` | users | email (unique, login id), first/last name, phone (unique, nullable), email_verified, phone_verified, is_active, is_staff | Custom user model |
| `OTP` | users | user, purpose (`email_verification`/`phone_verification`/`password_reset`), destination, **code_hash**, expires_at, attempts, consumed_at | Never stores plaintext codes |
| `UserDevice` | users | user, device_hash, platform, first_seen_at, last_seen_at, trusted | The member's own phone |
| `Gym` | gyms | name, address/city/state/country/postal_code, latitude, longitude, checkin_radius_meters, status | |
| `GymMembership` | gyms | user, gym, role (`member`/`staff`/`manager`/`owner`), status | unique per (user, gym) |
| `GymCheckinDevice` | gyms | gym, name, device_code, **secret_hash**, status, last_rotation_at | The kiosk |
| `CheckinSession` | gyms | gym, device, **token_hash**, expires_at, status (`active`/`consumed`/`expired`/`revoked`) | One per minted QR |
| `CheckIn` | checkins | user, gym, session (nullable), checked_in_at, latitude/longitude/location_accuracy, device (nullable, →UserDevice), verification_method (`qr`/`gps`/`manual`/`admin`), risk_score, status (`pending`/`verified`/`rejected`/`review`), idempotency_key | The audit-grade check-in record |
| `FraudEvent` | fraud | user, checkin (nullable), review (nullable, →FraudReview), event_type (9 values, §9), details | Audit log only |
| `FraudReview` | fraud | user, risk_level (`low`/`medium`/`high`), status (`open`/`approved`/`rejected`), reason, resolved_at, resolved_by, resolution_notes | Admin workflow — at most one `open` per user |
| `UserStreak` | streaks | user (**OneToOne**), current_streak, longest_streak, last_activity_date | Cache — derived from CheckIn |
| `StreakPolicy` | streaks | minimum_days_per_week, allowed_rest_days, grace_period (min), freeze_count | Singleton, admin-editable |
| `Product` | rewards | name, sku (unique), type (freeform), status | |
| `ProductVariant` | rewards | product, size, stock | Cache — derived from InventoryTransaction |
| `InventoryTransaction` | rewards | variant, quantity (signed), type (`restock`/`reserve`/`release`/`ship`/`adjustment`), reference | Append-only ledger — see §16.9 |
| `RewardDefinition` | rewards | name, description, reward_type (`merchandise`), required_streak, product, status, terms, + 5 protection gate fields (§11.5) | |
| `UserReward` | rewards | user, reward_definition (**unique together**), earned_at, claimed_at, status, **claim_code_hash** | One per (user, reward_definition), ever |
| `RewardClaim` | rewards | user_reward (**OneToOne**), variant, shipping_address (JSON snapshot), tracking_number, carrier, shipped_at, delivered_at, status | One per UserReward, ever. Fulfillment state machine: §16.8 |
| `Notification` | notifications | user, type (`streak_milestone`/`reward_unlocked`/`reward_shipped`/`challenge`/`system`), title, message, read_at, related_object_type, related_object_id | §12. `related_object_*` excluded from the API serializer — internal dedup key only, enforced by a partial `UniqueConstraint` when `related_object_id` is set |
| `Challenge` | challenges | name, description, start_date, end_date, reward_definition (nullable), status (`draft`/`active`/`completed`/`cancelled`) | Admin-managed, §16.10. No member-facing evaluation logic yet |
| `AuditLog` | audit | actor (nullable, →User), action, entity_type, entity_id, previous_state (JSON), new_state (JSON), reason | Append-only, written by every admin/operations service function. §16.11 |

Shared status enum (`RewardStatus`, used by both `UserReward` and `RewardClaim`): `earned → claimed → processing → shipped → delivered`, or `cancelled` at any point up to (but not including) `shipped` — see §16.8 for the exact transition table.

---

## 14. Rate limits (all `ScopedRateThrottle`, opt-in per view)

| Scope | Rate | Endpoint |
|---|---|---|
| `register` | 10/hour | POST /auth/register/ |
| `login` | 10/min | POST /auth/login/ |
| `email_send_verification` | 3/hour | POST /auth/email/send-verification/ |
| `email_verify` | 10/hour | POST /auth/email/verify/ |
| `password_forgot` | 5/hour | POST /auth/password/forgot/ |
| `password_reset` | 10/hour | POST /auth/password/reset/ |
| `token_refresh` | 60/min | POST /auth/refresh/ |
| `logout` | 30/min | POST /auth/logout/ |
| `gym_device_create` | 10/hour | POST /gym-devices/ |
| `gym_device_rotate` | 10/hour | POST /gym-devices/{id}/rotate/ |
| `gym_device_qr` | 10/min | GET /gym-devices/{id}/qr/ |
| `checkin_create` | 20/hour | POST /checkins/ |
| `reward_claim` | 10/hour | POST /rewards/{id}/claim/ |

Everything else (all `GET`s) is unthrottled.

---

## 15. Policy constants (settings.py, admin-tunable except where noted DB-backed)

| Constant | Value | Purpose |
|---|---|---|
| `OTP_LENGTH` / `OTP_EXPIRY_MINUTES` / `OTP_RESEND_COOLDOWN_SECONDS` / `OTP_MAX_ATTEMPTS` | 6 / 10 / 60 / 5 | Email OTP policy |
| `CHECKIN_QR_TTL_SECONDS` | 30 | QR token lifetime |
| `CHECKIN_GPS_ACCURACY_ALLOWANCE_METERS` | 50 | Max geofence extension from self-reported GPS accuracy |
| `CHECKIN_GPS_ACCURACY_WARN_METERS` | 30 | Below-this-precision soft risk signal |
| `CHECKIN_IMPOSSIBLE_TRAVEL_KMH` | 900 | Threshold for the impossible-travel fraud signal |
| `CHECKIN_VELOCITY_WINDOW_MINUTES` / `CHECKIN_VELOCITY_MAX_ATTEMPTS` | 60 / 5 | Too-many-check-ins window |
| `CHECKIN_SUSPICIOUS_REJECTED_THRESHOLD` | 3 | Repeated-rejection window trigger |
| `CHECKIN_RISK_HIGH_THRESHOLD` | 60 | Score ≥ this → `review` |
| `REWARD_FRAUD_LOOKBACK_DAYS` | 30 | Window for reward fraud-block check |
| `REWARD_FRAUD_BLOCK_EVENT_TYPES` | impossible_travel, multiple_accounts_device | Which FraudEvent types block a claim |
| `StreakPolicy` (DB row, not a settings constant) | see §10.3 | The only policy that's admin-editable at runtime without a deploy |

---

## 16. Admin/operations API

Every admin area needed to actually run the merchandise program end-to-end, all mounted under `/api/v1/admin/` (plus `/api/v1/admin/audit-logs/`). This is a REST alternative to (not a replacement for) Django admin at `/admin/` — both call into the exact same `apps/*/services.py` functions, so behavior, validation, and audit trail are identical regardless of which UI an operator uses. Every endpoint below normalizes errors through the same `{"error": {...}}` envelope (§2) as the member-facing API.

**Business logic — including the fulfillment state machine and every stock mutation — lives in `apps/*/services.py`, exactly like the member-facing API.** `apps/*/admin_views.py` stay thin (parse input, call a service, shape output); `apps/*/admin_serializers.py` hold admin-only request/response shapes, kept separate from the member-facing serializers in the same app so tightening or loosening one surface never accidentally affects the other.

### 16.1 Authorization

Every endpoint in this section requires `IsAuthenticated` **and** `apps.common.permissions.IsStaffUser` — `request.user.is_staff`, the same flag Django admin itself checks (not a separate "is admin" concept). A non-staff authenticated user gets **403** `"You do not have permission to access this admin resource."`; an unauthenticated request gets the usual **401**.

### 16.2 Users — `/api/v1/admin/users/`

| Endpoint | Purpose |
|---|---|
| `GET /admin/users/` | List/search users. Query params: `search` (email, icontains), `is_active` (`true`/`false`). |
| `GET /admin/users/{id}/` | User detail — includes `is_active`/`is_staff`/verification flags, `gym` (their `MEMBER`-role gym, same shape/lookup as `GET /me/`, §6.9), nothing password-related. |
| `POST /admin/users/{id}/status/` | `{"is_active": bool, "reason": ""}` — suspend or restore. Suspending also blacklists every outstanding refresh token (`apps.users.services.set_user_active`) — a still-unexpired access token would otherwise keep working up to its own lifetime. |
| `POST /admin/users/{id}/block-reward-claims/` | `{"reason": ""}` — opens (or reuses) a HIGH-risk `FraudReview`, exactly what `UserAdmin`'s bulk action does (`apps.fraud.services.block_reward_claims`). |

### 16.3 Gyms, staff, devices — `/api/v1/admin/gyms/`, `/admin/gym-memberships/`, `/admin/gym-devices/`

| Endpoint | Purpose |
|---|---|
| `GET`/`POST /admin/gyms/` | List (optional `?status=`, e.g. `?status=pending` for the review queue) / create a `Gym` (always created `active` — see §7.1 for the distinct self-service path). |
| `GET`/`PATCH /admin/gyms/{id}/` | Retrieve / partially update a `Gym` (any field, including `status`). |
| `POST /admin/gyms/{id}/approve/` | No body. Only allowed from `pending` — 400s otherwise. Sets `status=active`, making the gym visible/joinable everywhere member-facing. Calls `apps.gyms.services.admin_approve_gym`, the same function the Django admin "Approve selected pending gyms" bulk action uses. |
| `POST /admin/gyms/{id}/reject/` | `{"reason": ""}` (optional). Only allowed from `pending` — 400s otherwise. Sets `status=rejected`; the reason is recorded on the audit log entry only (no dedicated field on `Gym` yet). Calls `apps.gyms.services.admin_reject_gym`. |
| `GET`/`POST /admin/gym-memberships/` | List (`?gym=`, `?user=`) / upsert a `GymMembership` (`user`, `gym`, `role`, `status`) — assigns staff/manager/owner access. |
| `GET /admin/gym-devices/` | List check-in kiosks across every gym (`?gym=`) — the member-facing `gym-devices` endpoints only ever show one gym's own devices. |
| `GET /admin/gym-devices/{id}/` | Device detail. |
| `POST /admin/gym-devices/{id}/status/` | `{"status": "active"|"disabled", "reason": ""}` — a compromised-kiosk response: disabling immediately revokes every outstanding `ACTIVE` `CheckinSession` for that device, same as rotation. |

### 16.4 Check-ins — `/api/v1/admin/checkins/`

| Endpoint | Purpose |
|---|---|
| `GET /admin/checkins/` | List every check-in attempt (`?user=`, `?gym=`, `?status=`) — unlike the member-facing list, includes `risk_score` (not a tuning-oracle risk for an admin viewer) and `idempotency_key`. |
| `GET /admin/checkins/{id}/` | Detail. |
| `POST /admin/checkins/{id}/resolve/` | `{"status": "verified"|"rejected", "reason": ""}` — the human decision point for a `review`-status check-in. Only reachable from `status=review`; resolving to `verified` triggers the exact same `rebuild_user_streak` path a live verified check-in would, so a manually-cleared check-in counts toward streaks/rewards identically. |

### 16.5 Streaks — `/api/v1/admin/streaks/`, `/admin/streak-policy/`

| Endpoint | Purpose |
|---|---|
| `GET /admin/streaks/` | List every `UserStreak`. |
| `GET /admin/streaks/{user_id}/` | One user's streak (looked up by **user id**, not the `UserStreak` row's own id — auto-created with zeros if the user has never checked in). |
| `POST /admin/streaks/{user_id}/rebuild/` | Rebuilds one user's streak via the one calculation path (`rebuild_user_streak`), audited. |
| `POST /admin/streaks/rebuild-all/` | Bulk equivalent of the `rebuild_streaks` management command, reachable over the API. Returns `{"rebuilt": <count>}`. |
| `GET`/`PATCH /admin/streak-policy/` | Read/update the singleton `StreakPolicy` — the same row `python manage.py rebuild_streaks` and every check-in read against. |

### 16.6 Fraud — `/api/v1/admin/fraud-reviews/`, `/admin/fraud-events/`

| Endpoint | Purpose |
|---|---|
| `GET /admin/fraud-reviews/` | List (`?status=`, `?user=`). |
| `GET /admin/fraud-reviews/{id}/` | Detail. |
| `POST /admin/fraud-reviews/{id}/resolve/` | `{"status": "approved"|"rejected", "resolution_notes": ""}` — only valid from `status=open` (§9.3's `resolve_review`); any other transition is a **400**. |
| `GET /admin/fraud-events/` | Read-only audit log (`?user=`, `?event_type=`) — `FraudEvent` rows are never created or edited through this API, only read. |

### 16.7 Products, reward definitions — `/api/v1/admin/products/`, `/admin/product-variants/`, `/admin/reward-definitions/`

| Endpoint | Purpose |
|---|---|
| `GET`/`POST /admin/products/` | List (`?status=`) / create a `Product`. |
| `GET`/`PATCH /admin/products/{id}/` | Retrieve / update. |
| `GET`/`POST /admin/product-variants/` | List (`?product=`) / create a `ProductVariant`. `POST` body: `{"product": "<uuid>", "size": "M", "initial_stock": 0}` — a nonzero `initial_stock` is recorded as a real `restock`-typed `InventoryTransaction` at creation time, never set directly on the row (§16.9's "never modify stock without a transaction" rule applies from the very first unit). |
| `GET /admin/product-variants/{id}/` | Detail. `stock` is always read-only here — see §16.9 for the only ways it can move. |
| `GET`/`POST /admin/reward-definitions/` | List (`?status=`) / create a `RewardDefinition`, including the 5 protection-gate fields (§11.5). |
| `GET`/`PATCH /admin/reward-definitions/{id}/` | Retrieve / update. |

### 16.8 Reward claims & shipping — `/api/v1/admin/reward-claims/`, `/admin/shipments/`

| Endpoint | Purpose |
|---|---|
| `GET /admin/reward-claims/` | List (`?status=`, `?user=`), paginated. |
| `GET /admin/reward-claims/{id}/` | Detail — includes `tracking_number`, `carrier`, `shipped_at`, `delivered_at`. |
| `POST /admin/reward-claims/{id}/transition/` | The fulfillment state machine's only entry point over the API. `{"status": "...", "tracking_number": "...", "carrier": "...", "reason": ""}` (`tracking_number`/`carrier` optional, set only when supplied). See the transition table below. |
| `GET /admin/shipments/` | Read-only: every claim currently `processing`/`shipped`/`delivered`, newest-shipped-first — "Shipping" as its own admin area, backed by the same `RewardClaim` data (claims ARE shipments; this view just filters to the fulfillment-in-progress-or-done slice). |

**Fulfillment state machine** (`apps.rewards.services.transition_claim_status`, `CLAIM_ALLOWED_TRANSITIONS`) — the single code path both this API and `RewardClaimAdmin` delegate to:

```
claimed ──▶ processing ──▶ shipped ──▶ delivered
   │            │
   └──▶ cancelled ◀──┘
```

| From | To | Effect |
|---|---|---|
| `claimed` | `processing` | Status only. |
| `claimed` | `cancelled` | Releases the reserved unit (`release`-typed `InventoryTransaction`, `+1`), mirrors `UserReward.status`. |
| `processing` | `shipped` | Sets `shipped_at`, records a `ship`-typed `InventoryTransaction` (`0`, a ledger marker only — stock already moved at claim time), fires the async `REWARD_SHIPPED` notification (§12). |
| `processing` | `cancelled` | Same as `claimed → cancelled`. |
| `shipped` | `delivered` | Sets `delivered_at`. |

Any transition not listed above — including `shipped`/`delivered` → `cancelled`, or skipping a stage (`claimed` → `shipped`) — is rejected with **400** `"Cannot transition a reward claim from '<from>' to '<to>'."`. `delivered` and `cancelled` are terminal: no re-claim or un-cancel path exists in this phase.

### 16.9 Inventory — `/api/v1/admin/inventory-transactions/`, `/admin/product-variants/{id}/restock/`, `/admin/product-variants/{id}/adjust/`, `/admin/inventory/reserved/`, `/admin/inventory/shipped/`

**`ProductVariant.stock` can only ever move through a matching `InventoryTransaction` row — there is no code path that writes `stock` without one.** Four writers, each type-tagged in the ledger:

| Endpoint | Ledger type | Notes |
|---|---|---|
| `POST /admin/product-variants/{id}/restock/` `{"quantity": <positive int>, "reference": ""}` | `restock` | "More stock arrived." Quantity must be positive. |
| `POST /admin/product-variants/{id}/adjust/` `{"quantity": <nonzero int>, "reason": <required>, "reference": ""}` | `adjustment` | General correction, either direction (damaged/lost/found goods, reconciliation) — distinct from `restock` specifically so the ledger keeps "stock arrived" and "we corrected a discrepancy" apart. `reason` is mandatory (unlike restock's optional `reference`); rejected with **400** if it would take stock below zero, or if `quantity` is `0`. |
| (claim creation) | `reserve` (`-1`) | Already existed — member-facing `POST /rewards/{id}/claim/` (§11.5). |
| (claim cancellation) | `release` (`+1`) | Already existed, now also reachable via §16.8's transition endpoint. |
| (claim shipped) | `ship` (`0`) | New: a pure ledger marker recorded by the transition endpoint, so the ledger shows exactly when a unit shipped, not just when it was reserved. |

Read/inspection endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /admin/inventory-transactions/` | The full ledger (`?variant=`, `?type=`), paginated, newest-first — the audit trail behind every `stock` value. |
| `GET /admin/inventory/reserved/` | Per-variant count of units currently reserved but not yet shipped (`RewardClaim.status` in `claimed`/`processing`) — units already decremented from `stock` but still physically on-site. |
| `GET /admin/inventory/shipped/` | Per-variant count of units that have left the building (`RewardClaim.status` in `shipped`/`delivered`) — a read-time aggregate over claim status, not a separate running counter. |

### 16.10 Challenges — `/api/v1/admin/challenges/`

Admin-managed only, same phase-appropriate scope as `Product`/`RewardDefinition` when they were first introduced: no member-facing read/write path or automatic evaluation logic yet (see `Challenge`'s model docstring) — this phase only adds the operator-facing CRUD needed to start authoring them.

| Endpoint | Purpose |
|---|---|
| `GET`/`POST /admin/challenges/` | List (`?status=`) / create. Fields: `name`, `description`, `start_date`, `end_date`, `reward_definition` (nullable — a bonus tier on top of normal streak-milestone rewards), `status` (`draft`/`active`/`completed`/`cancelled`). |
| `GET`/`PATCH /admin/challenges/{id}/` | Retrieve / update. |

### 16.11 Audit logs — `/api/v1/admin/audit-logs/`

Read-only, admin-only — **the API that would let someone edit the audit trail doesn't exist on purpose.** Every mutating admin/operations service function above (and `apps.fraud.services`' review/block-claim functions) calls `apps.audit.services.record()`, the single write path for this table.

`GET /admin/audit-logs/` — query params: `entity_type` (e.g. `RewardClaim`, `Gym`, `ProductVariant`), `entity_id`, `action` (e.g. `reward_claim.status_transition`, `inventory.restock`, `user.suspend`), `actor` (user id). Paginated, newest-first.

```json
{
  "id": "<uuid>", "actor": "<uuid|null>", "actor_email": "admin@example.com",
  "action": "reward_claim.status_transition", "entity_type": "RewardClaim", "entity_id": "<uuid>",
  "previous_state": {"status": "processing"}, "new_state": {"status": "shipped", "tracking_number": "1Z999", "carrier": "UPS"},
  "reason": "", "created_at": "..."
}
```

`actor` is nullable for system-driven changes (e.g. a future management command); every admin-API-driven change always has one. `previous_state`/`new_state` are free-form JSON snapshots (`django.forms.models.model_to_dict` for whole-object CRUD, a minimal `{"status": ...}`-style dict for status-only transitions) — shaped per action, not a fixed schema, since "what changed" means something different for a gym's address than for a claim's fulfillment status.

---

## 17. Interactive reference

Swagger UI: `GET /api/v1/docs/` · Redoc: `GET /api/v1/redoc/` · Raw OpenAPI schema: `GET /api/v1/schema/` — auto-generated from the same serializers/views this document describes, useful for exact field types and generating a client SDK.
