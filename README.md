# GymStreak

Users maintain verified gym streaks, check into gyms, build streaks, unlock milestone rewards, and claim physical merchandise based on verified streaks.

This is a hobby project. Current phases cover: project foundation (infra, security defaults, API versioning, docs), the full user/auth system (registration, login, email verification, password reset, OTP infrastructure, device tracking, profile), gyms with secure dynamic QR check-in infrastructure (gym records, staff roles, check-in devices, short-lived signed single-use QR tokens), the core verified check-in flow (QR redemption, GPS geofencing, idempotency, and simple rule-based fraud/risk scoring), the streak engine (a cached `UserStreak` fully derived from verified check-ins, never incremented directly), the reward/merchandise system (streak-milestone rewards, inventory-backed physical claims with race-safe reservation), fraud hardening against reward farming (user-level deterministic risk assessment, an admin fraud-review workflow, and configurable per-reward eligibility gates), Celery/Redis background processing (a `Notification` inbox, async email/OTP delivery, reward/streak-milestone notifications, fraud analysis, and check-in analytics — all scheduled via `transaction.on_commit()` and idempotent under retry), and a staff-only admin/operations REST API (users, gyms, gym devices, check-ins, streaks, fraud, rewards, products, inventory, reward claims, shipping, challenges, and audit logs) running alongside Django admin against the exact same service-layer code.

**For the full API contract (every endpoint, request/response shapes, status codes, error cases) and the end-to-end application flow, see [API_CONTRACTS.md](API_CONTRACTS.md).**

## Stack

Python 3.13, Django, DRF, PostgreSQL, Redis, Celery, Docker Compose, drf-spectacular (OpenAPI/Swagger), JWT auth (djangorestframework-simplejwt), UUID primary keys.

## Architecture

Modular Django monolith. Apps live under `apps/`:

- `common` — shared UUID/timestamp base model, DRF exception handler, pagination, health check
- `users` — custom User model (email login), JWT auth endpoints
- `gyms` — gym records, staff membership/roles, check-in devices, dynamic QR check-in tokens
- `checkins` — the verified check-in flow: QR redemption, geofencing, idempotency, duplicate prevention
- `fraud` — simple rule-based risk scoring (per check-in, and a user-level `FraudReview` workflow), audit log feeding `checkins` and `rewards`
- `streaks` — cached `UserStreak`/`StreakPolicy`, fully rebuildable from verified `CheckIn` history
- `rewards` — streak-milestone `RewardDefinition`s, `UserReward`/`RewardClaim` lifecycle, `Product`/`ProductVariant`/`InventoryTransaction` ledger-backed inventory
- `notifications` — the `Notification` inbox (`STREAK_MILESTONE`/`REWARD_UNLOCKED`/`REWARD_SHIPPED`/`NEW_FOLLOWER`/`CHALLENGE`/`SYSTEM`), a provider-agnostic `notify()` service, the Celery tasks that create notifications asynchronously off other apps' events, and browser Web Push delivery (`PushSubscription`, VAPID) off that same `notify()` choke point
- `challenges` — admin-managed `Challenge` records (time-boxed events, optionally linked to a bonus `RewardDefinition`); no member-facing logic yet
- `audit` — the single-write-path `AuditLog`: actor, action, entity, previous/new state, reason, timestamp, for every admin/operations mutation across the whole system

**Admin/operations API** (`/api/v1/admin/...`, plus `/api/v1/admin/audit-logs/`): every area needed to actually run the merchandise program — users (suspend/restore, block reward claims), gyms/staff/devices, check-ins (resolve a flagged review), streaks (rebuild, tune `StreakPolicy`), fraud (resolve reviews), products/reward definitions, inventory (restock/adjust/reserved/shipped, always ledger-backed), reward claims/shipping (the `CLAIMED → PROCESSING → SHIPPED → DELIVERED`/`CANCELLED` fulfillment state machine), challenges, and audit logs. Gated by `apps.common.permissions.IsStaffUser` (`User.is_staff`) on every endpoint — see `API_CONTRACTS.md` §16 for the full surface. Each `admin_views.py`/`admin_serializers.py` pair lives beside the app's member-facing `views.py`/`serializers.py` and calls into the *same* `services.py`, so Django admin and the REST API can never drift apart in behavior.

**Business logic — including authorization — goes in service functions/classes (`services.py` in the owning app), not in views, serializers, or custom permission classes.** Views/serializers stay thin: parse input, call a service, shape output. `apps/users/services.py`, `apps/gyms/services.py`, `apps/checkins/services.py`, `apps/fraud/services.py`, `apps/streaks/services.py`, `apps/rewards/services.py`, `apps/challenges/services.py`, `apps/audit/services.py`, and `apps/notifications/services.py` are the populated examples — add `services.py` to another app when it gets its first real use case.

**Background jobs (Celery + Redis) handle non-critical side effects, never request-determining logic.** Everything that decides a response — QR/geofence validation, streak/reward computation, a check-in's own `status` — stays synchronous, in the same transaction, so an API response is never stale relative to what it just did. Side effects that don't gate the response (email/OTP delivery, reward/streak-milestone/reward-shipped notifications, fraud-review analysis, check-in analytics) are scheduled via `transaction.on_commit()` so a task can never fire for a DB row that then fails to commit. Every task re-fetches its data by id and is safe to run more than once (either naturally idempotent, or backed by a DB-level `UniqueConstraint` — see `apps.notifications.services.notify`). `celery_worker`/`celery_beat` don't autoreload — restart them (`docker compose restart celery_worker celery_beat`) after editing any `tasks.py`.

**The database is the source of truth.** Never trust client-provided streaks, reward eligibility, check-in dates, reward status, or inventory counts — every one of those is always recomputed/verified server-side against stored data (`UserStreak` from verified `CheckIn`s, reward eligibility from the current streak, `ProductVariant.stock` from the `InventoryTransaction` ledger).

## Local development

```bash
cp .env.example .env   # edit DJANGO_SECRET_KEY etc.
docker compose up --build -d
docker compose logs web --tail=50   # confirm migrations ran
curl http://localhost:8000/health/
open http://localhost:8000/api/v1/docs/
```

Run the smoke tests:

```bash
docker compose exec web python manage.py test
```

Create an admin user (or set `DJANGO_SUPERUSER_EMAIL`/`DJANGO_SUPERUSER_PASSWORD` in `.env` to auto-bootstrap one):

```bash
docker compose exec web python manage.py createsuperuser
```

## API

All application endpoints are versioned under `/api/v1/`. `/health/` is unversioned (infra-level). Interactive docs at `/api/v1/docs/` (Swagger) and `/api/v1/redoc/`.

Auth (`/api/v1/auth/`):
- `register/`, `login/`, `logout/`, `refresh/`
- `email/send-verification/`, `email/verify/`
- `password/forgot/`, `password/reset/`

Profile: `GET`/`PATCH /api/v1/me/`.

Phone number can be set via `PATCH /api/v1/me/`, but phone verification isn't wired to an endpoint yet — the `OTP` model's `phone_verification` purpose exists as forward-compatible infrastructure for a future phase.

Gyms:
- `GET /api/v1/gyms/`, `GET /api/v1/gyms/{id}/` — public read (no auth required, so registration can populate a gym picker before an account exists), active gyms only.
- `POST /api/v1/gyms/` — self-service: any authenticated user can create a gym and becomes its `OWNER`, but it starts `pending` (invisible everywhere member-facing) until a platform staff user approves or rejects it, via `POST /api/v1/admin/gyms/{id}/approve/`+`/reject/` or the Django admin "Approve/Reject selected pending gyms" bulk actions — both paths call the same `apps.gyms.services.admin_approve_gym`/`admin_reject_gym`.
- `POST /api/v1/gym-devices/`, `POST /api/v1/gym-devices/{id}/rotate/`, `GET /api/v1/gym-devices/{id}/qr/` — gym staff only (an `ACTIVE` `GymMembership` with role `STAFF`/`MANAGER`/`OWNER` at that specific gym). Gyms created directly by admins (Django admin or `/api/v1/admin/gyms/`) go straight to `active`, no review step. QR tokens are short-lived (30s), signed, single-use, and never expose database IDs or secrets.
- Gym self-service management (`GET`/`PATCH /api/v1/gyms/{id}/`, `/gyms/{id}/members/`, `/devices/`, `/staff/`, `/staff-invites/`) — an `OWNER` edits their own gym's profile and manages staff of any role; a `MANAGER` can only add/remove `STAFF`-tier people; `STAFF` gets read-only roster/staff access plus the device endpoints above. Staff are added via an email invite (`POST /gyms/{id}/staff-invites/`) that works even for someone with no account yet — they register/log in, then accept at `/staff-invites/{token}/accept/`, gated by their own email matching the invite. Platform admins can still assign staff directly via `/api/v1/admin/gym-memberships/` (see below) when needed.

Check-ins:
- `POST /api/v1/checkins/` — the member-facing endpoint. Core rule: the client only supplies evidence (`gym_id`, `qr_token`, GPS coordinates, optional device info); the backend alone decides `status` (`verified`/`rejected`/`review`) via QR validation, expiry, gym-matching, replay prevention, geofencing (accounting for GPS accuracy, gym-configurable radius), same-day duplicate checks, and simple rule-based fraud/risk scoring (`apps/fraud`) — never ML. Supports an `Idempotency-Key` header so retried requests can't create duplicate check-ins, even under real concurrency. The response never includes the numeric `risk_score` or fraud-event details (audit/admin-only) — only a generic status and message.
- `GET /api/v1/me/checkins/` — the caller's own check-in history, paginated.

Streaks — another core rule: verified `CheckIn` rows are the source of truth, `UserStreak` is a cached derivation, never incremented directly. Every trigger (a new verified check-in, an explicit rebuild) calls the exact same full-recompute function (`apps.streaks.services.rebuild_user_streak`), so the cache can't drift from a partial update.
- `GET /api/v1/me/streak/` — the caller's cached `current_streak`/`longest_streak`/`last_activity_date`.
- `GET /api/v1/me/calendar/` — per-day check-in activity over a date range (`start`/`end` query params, defaults to the trailing 90 days), plus the streak summary for context.
- `python manage.py rebuild_streaks [--user-id <uuid>]` — internal/admin operation to recompute a streak (or every user's) from scratch, e.g. after a `StreakPolicy` change. Also available as a bulk action in the Django admin on `UserStreak`.

Rewards — financially sensitive (physical merchandise). Milestones are evaluated automatically every time a streak is recomputed (`RewardDefinition.required_streak <= UserStreak.current_streak` → an `EARNED` `UserReward`, at most once per user per reward, never clawed back if the streak later drops).
- `GET /api/v1/rewards/`, `GET /api/v1/rewards/{id}/` — available (`ACTIVE`) reward tiers, with each eligible `ProductVariant`'s size and in-stock status (never the raw count).
- `GET /api/v1/me/rewards/`, `GET /api/v1/me/rewards/{id}/` — the caller's own earned/claimed rewards; the detail view nests the `RewardClaim` (tracking, carrier, status) once one exists.
- `POST /api/v1/rewards/{id}/claim/` — claim an earned reward tier, picking a `variant_id` and a shipping `address` snapshot. Inventory is reserved under `select_for_update()` row locks (locking order: `UserReward` before `ProductVariant`, always) so two concurrent claims for the same reward return the same claim, and two different users racing for the last unit never both win. A one-time redemption code (hashed at rest, shown once in the response) is generated at claim time. Duplicate requests are idempotent via a `RewardClaim`-per-`UserReward` uniqueness constraint — no separate idempotency key needed.
- Fulfillment (`PROCESSING`/`SHIPPED`/`DELIVERED`/`CANCELLED`) is admin-managed, via Django admin or `POST /api/v1/admin/reward-claims/{id}/transition/` — both call the same `apps.rewards.services.transition_claim_status`, which only allows `CLAIMED → PROCESSING → SHIPPED → DELIVERED` (or `CANCELLED` before shipping) and rejects anything else with a 400. Cancelling releases the reserved inventory automatically.
- Higher-value reward tiers can opt into eligibility gates: `require_email_verified`, `require_phone_verified`, `minimum_account_age_days`, `minimum_verified_checkins`, `block_if_high_risk_review` — all off by default, each gives a specific actionable error except the fraud-review gate, which (like a suspended account) returns the same generic message as every other fraud-sensitive rejection.

Fraud hardening — deterministic, explainable, no ML. `apps.fraud.services.assess_user` scores a user from a rolling window over their `FraudEvent` history (QR reuse, GPS mismatch, excessive check-ins, impossible travel, device sharing, repeated failures) plus two live-computed signals with no other detection path (account-creation bursts and reward-claim-farming rings, both keyed on shared `device_hash`). A `LOW`/`MEDIUM`/`HIGH` result never itself changes anything — the only automatic consequence of `HIGH` is opening a `FraudReview` for human attention (`apps.fraud.services.assess_and_flag`, run asynchronously via `assess_and_flag_task` after every check-in outcome — the check-in's own `status` is already committed by the time this runs, so this is a non-critical side effect, not a request-determining decision). Admin reviews, approves, or rejects `FraudReview`s in Django admin (`FraudReviewAdmin`) or via `POST /api/v1/admin/fraud-reviews/{id}/resolve/` — both delegate to `apps.fraud.services.resolve_review`, which only allows `OPEN → APPROVED`/`OPEN → REJECTED`. Suspending/restoring a user is the `User.is_active` field, already fully enforced (simplejwt re-checks it on every request, not just at login) — reachable via Django admin or `POST /api/v1/admin/users/{id}/status/`, which additionally blacklists outstanding refresh tokens on suspend.

Admin/operations API (`/api/v1/admin/...`) — see `API_CONTRACTS.md` §16 for the full endpoint-by-endpoint reference. Gated by `IsStaffUser` on every endpoint. Every mutation, whether made here or in Django admin, writes an `apps.audit.AuditLog` row (`GET /api/v1/admin/audit-logs/`, filterable by `entity_type`/`entity_id`/`action`/`actor`) recording actor, action, entity, previous/new state, timestamp, and reason.

Notifications — a provider-agnostic in-app inbox (`apps.notifications`), fed by Celery tasks off other apps' events (never written to synchronously by those apps).
- `GET /api/v1/me/notifications/` — the caller's own notifications, paginated, newest-first.
- `GET /api/v1/me/notifications/unread-count/` — `{"count": <int>}`, for a bell badge.
- `POST /api/v1/me/notifications/{id}/read/` — marks one as read; idempotent (a second call is a no-op, still 200), 404 for a non-owned id.
- Types: `STREAK_MILESTONE` (a new all-time-high streak), `REWARD_UNLOCKED` (a `UserReward` earned), `REWARD_SHIPPED` (admin marks a `RewardClaim` shipped), `NEW_FOLLOWER`, `CHALLENGE`/`SYSTEM` (reserved, unused this phase).
- Browser push (`apps.notifications.push`, VAPID/Web Push via `pywebpush`): `apps.notifications.services.notify()` is the single choke point every notification-producing task already goes through, so a push is scheduled there too — once, only on genuine creation, via `transaction.on_commit()`. `GET /api/v1/push/vapid-public-key/` (unauthenticated) and `POST`/`DELETE /api/v1/me/push-subscriptions/` manage the browser's subscription; a 404/410 from the push service soft-disables the `PushSubscription` row rather than deleting it, matching this codebase's existing `is_active`-style soft-disable convention. See `API_CONTRACTS.md` §12.6.
- Duplicate-safe by construction: a partial `UniqueConstraint` on `(user, type, related_object_type, related_object_id)` means re-running a task for the same event (e.g. a retried Celery task) never creates a second notification.
