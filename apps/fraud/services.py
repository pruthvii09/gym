"""Simple, rule-based fraud detection. No ML -- straightforward, explainable
point-additive rules only.

Two distinct, deliberately separate concerns live here:
- score_checkin: is THIS ONE check-in attempt suspicious (feeds
  CheckIn.risk_score / status=review).
- assess_user / ensure_open_review / assess_and_flag ("FraudRiskService" --
  this codebase has no class-based services anywhere, so this is
  implemented as plain functions, consistent with every other app):
  is THIS USER, overall, currently risky, based on a rolling window over
  their full history. The only automatic consequence of a HIGH assessment
  is opening a FraudReview for human attention -- nothing here ever
  auto-bans or auto-blocks anything itself.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit import services as audit_services
from apps.checkins.models import CheckIn
from apps.common.geo import haversine_distance_meters
from apps.fraud.models import FraudEvent, FraudReview
from apps.users.models import UserDevice


def record_event(*, user, checkin, event_type, details=""):
    return FraudEvent.objects.create(
        user=user, checkin=checkin, event_type=event_type, details=details
    )


def score_checkin(*, user, gym, device, location_accuracy):
    score = 0
    fired = []

    if device is None:
        score += settings.CHECKIN_RISK_WEIGHT_NO_DEVICE
        fired.append((FraudEvent.EventType.DEVICE_ANOMALY, "no device_hash supplied"))

    if (
        location_accuracy is not None
        and location_accuracy > settings.CHECKIN_GPS_ACCURACY_WARN_METERS
    ):
        score += settings.CHECKIN_RISK_WEIGHT_POOR_ACCURACY
        # No dedicated FraudEvent: not one of the seven named types, purely
        # a scoring signal.

    last = (
        CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED)
        .exclude(gym=gym)
        .order_by("-checked_in_at")
        .first()
    )
    if last:
        elapsed_hours = (timezone.now() - last.checked_in_at).total_seconds() / 3600
        if elapsed_hours > 0:
            distance_km = (
                haversine_distance_meters(
                    gym.latitude, gym.longitude, last.gym.latitude, last.gym.longitude
                )
                / 1000
            )
            implied_kmh = distance_km / elapsed_hours
            if implied_kmh > settings.CHECKIN_IMPOSSIBLE_TRAVEL_KMH:
                score += settings.CHECKIN_RISK_WEIGHT_IMPOSSIBLE_TRAVEL
                fired.append(
                    (
                        FraudEvent.EventType.IMPOSSIBLE_TRAVEL,
                        f"implied_speed={implied_kmh:.0f}km/h gym_a={last.gym_id} gym_b={gym.id}",
                    )
                )

    if device is not None:
        if UserDevice.objects.filter(device_hash=device.device_hash).exclude(user=user).exists():
            score += settings.CHECKIN_RISK_WEIGHT_MULTI_ACCOUNT_DEVICE
            fired.append(
                (
                    FraudEvent.EventType.MULTIPLE_ACCOUNTS_DEVICE,
                    "device_hash linked to other user(s)",
                )
            )

    window_start = timezone.now() - timedelta(minutes=settings.CHECKIN_VELOCITY_WINDOW_MINUTES)
    recent = CheckIn.objects.filter(user=user, created_at__gte=window_start).count()
    if recent >= settings.CHECKIN_VELOCITY_MAX_ATTEMPTS:
        score += settings.CHECKIN_RISK_WEIGHT_VELOCITY
        fired.append(
            (
                FraudEvent.EventType.TOO_MANY_CHECKINS,
                f"{recent} attempts in {settings.CHECKIN_VELOCITY_WINDOW_MINUTES}min",
            )
        )

    recent_rejected = CheckIn.objects.filter(
        user=user, status=CheckIn.Status.REJECTED, created_at__gte=window_start
    ).count()
    if recent_rejected >= settings.CHECKIN_SUSPICIOUS_REJECTED_THRESHOLD:
        score += settings.CHECKIN_RISK_WEIGHT_SUSPICIOUS_PATTERN
        fired.append(
            (
                FraudEvent.EventType.SUSPICIOUS_PATTERN,
                f"{recent_rejected} rejected in {settings.CHECKIN_VELOCITY_WINDOW_MINUTES}min",
            )
        )

    return min(score, 100), fired


def _device_hashes_for_user(user):
    return UserDevice.objects.filter(user=user).values_list("device_hash", flat=True)


def _detect_suspicious_account_creation(user):
    """Live signal, not read from FraudEvent history: this user shares a
    device with >= N other users, all created within a tight recent window
    of each other -- an account-farming burst signature.
    """
    device_hashes = list(_device_hashes_for_user(user))
    if not device_hashes:
        return False, ""

    window_start = timezone.now() - timedelta(hours=settings.FRAUD_ACCOUNT_FARM_WINDOW_HOURS)
    siblings = (
        UserDevice.objects.filter(device_hash__in=device_hashes)
        .exclude(user=user)
        .values_list("user_id", "user__created_at")
    )
    recent = {uid for uid, created_at in siblings if created_at >= window_start}
    if len(recent) >= settings.FRAUD_ACCOUNT_FARM_MIN_USERS:
        return True, (
            f"{len(recent)} other user(s) sharing device, created within "
            f"{settings.FRAUD_ACCOUNT_FARM_WINDOW_HOURS}h"
        )
    return False, ""


def _detect_suspicious_reward_claiming(user):
    """Live signal: this user shares a device with >= N other users who
    ALSO have at least one RewardClaim -- a claim-farming-ring pattern.

    Local import: apps.rewards.services imports apps.fraud.models (not
    apps.fraud.services), so this import creates no cycle.
    """
    from apps.rewards.models import RewardClaim

    device_hashes = list(_device_hashes_for_user(user))
    if not device_hashes:
        return False, ""

    sibling_ids = (
        UserDevice.objects.filter(device_hash__in=device_hashes)
        .exclude(user=user)
        .values_list("user_id", flat=True)
        .distinct()
    )
    count = (
        RewardClaim.objects.filter(user_reward__user_id__in=sibling_ids)
        .values_list("user_reward__user_id", flat=True)
        .distinct()
        .count()
    )
    if count >= settings.FRAUD_REWARD_FARM_MIN_USERS:
        return True, f"{count} other device-sharing user(s) with claims"
    return False, ""


def _log_once(user, event_type, details, guard_hours=24):
    cutoff = timezone.now() - timedelta(hours=guard_hours)
    if FraudEvent.objects.filter(user=user, event_type=event_type, created_at__gte=cutoff).exists():
        return
    record_event(user=user, checkin=None, event_type=event_type, details=details)


def assess_user(user):
    """Deterministic, point-additive user-level risk assessment. Reads
    mostly-existing FraudEvent history (6 signals already logged reactively
    by the check-in flow) plus 2 live-computed checks for the 2 signal
    types that have no other detection path. Returns (RiskLevel, fired).
    """
    score = 0
    fired = []

    lookback = timezone.now() - timedelta(days=settings.FRAUD_RISK_LOOKBACK_DAYS)
    counts = dict(
        FraudEvent.objects.filter(user=user, created_at__gte=lookback)
        .values("event_type")
        .annotate(n=Count("id"))
        .values_list("event_type", "n")
    )
    for event_type, weight in settings.FRAUD_RISK_EVENT_WEIGHTS.items():
        n = counts.get(event_type, 0)
        if n:
            score += weight * n
            fired.append((event_type, f"{n} occurrence(s) in {settings.FRAUD_RISK_LOOKBACK_DAYS}d"))

    hit, details = _detect_suspicious_account_creation(user)
    if hit:
        score += settings.FRAUD_RISK_WEIGHT_ACCOUNT_FARM
        fired.append((FraudEvent.EventType.SUSPICIOUS_ACCOUNT_CREATION, details))
        _log_once(user, FraudEvent.EventType.SUSPICIOUS_ACCOUNT_CREATION, details)

    hit, details = _detect_suspicious_reward_claiming(user)
    if hit:
        score += settings.FRAUD_RISK_WEIGHT_REWARD_FARM
        fired.append((FraudEvent.EventType.SUSPICIOUS_REWARD_CLAIM, details))
        _log_once(user, FraudEvent.EventType.SUSPICIOUS_REWARD_CLAIM, details)

    score = min(score, 100)
    if score >= settings.FRAUD_RISK_HIGH_THRESHOLD:
        level = FraudReview.RiskLevel.HIGH
    elif score >= settings.FRAUD_RISK_MEDIUM_THRESHOLD:
        level = FraudReview.RiskLevel.MEDIUM
    else:
        level = FraudReview.RiskLevel.LOW
    return level, fired


def ensure_open_review(user, *, risk_level, reason):
    """Idempotent: returns the existing OPEN review if one exists, else
    creates and returns a new one. Always returns a FraudReview, never None.
    """
    existing = FraudReview.objects.filter(user=user, status=FraudReview.Status.OPEN).first()
    if existing is not None:
        return existing
    return FraudReview.objects.create(user=user, risk_level=risk_level, reason=reason)


def assess_and_flag(user):
    """The ONLY automatic consequence of a HIGH assessment is opening a
    review for human attention -- nothing about account state or claim
    eligibility changes here. Satisfies 'do not automatically ban users
    based on one signal': claim-blocking is a separate, explicit check
    against FraudReview state at claim time (apps.rewards.services).
    """
    level, fired = assess_user(user)
    if level == FraudReview.RiskLevel.HIGH:
        reason = "Automated: HIGH risk (" + "; ".join(f"{et}: {d}" for et, d in fired) + ")"
        ensure_open_review(user, risk_level=level, reason=reason)
    return level


def block_reward_claims(*, actor, user, reason="Manually blocked by admin"):
    """One-click 'stop this user from claiming rewards' -- opens (or reuses)
    a HIGH-risk FraudReview, which apps.rewards.services._check_reward_protection
    already enforces for any tier with block_if_high_risk_review=True. The
    single code path behind both UserAdmin's bulk action and the admin API.
    """
    review = ensure_open_review(user, risk_level=FraudReview.RiskLevel.HIGH, reason=reason)
    audit_services.record(
        actor=actor,
        action="user.block_reward_claims",
        entity=user,
        new_state={"fraud_review_id": str(review.id), "risk_level": review.risk_level},
        reason=reason,
    )
    return review


# A review's status only ever moves OPEN -> APPROVED or OPEN -> REJECTED --
# both terminal, matching FraudReviewAdmin's existing "only OPEN reviews are
# actionable" behavior, now enforced as an explicit transition table instead
# of an implicit queryset filter.
REVIEW_ALLOWED_TRANSITIONS = {
    FraudReview.Status.OPEN: {FraudReview.Status.APPROVED, FraudReview.Status.REJECTED},
}


def resolve_review(*, actor, review, new_status, resolution_notes=""):
    """Moves a FraudReview out of OPEN. Approved = the flagged concern is
    confirmed valid; rejected = dismissed as a false positive -- see
    FraudReview.Status docstring. Shared by FraudReviewAdmin's bulk actions
    and the admin API so there's exactly one resolution code path.
    """
    allowed = REVIEW_ALLOWED_TRANSITIONS.get(review.status, set())
    if new_status not in allowed:
        raise ValidationError(
            f"Cannot transition a fraud review from '{review.status}' to '{new_status}'."
        )

    previous_state = {"status": review.status}
    review.status = new_status
    review.resolved_at = timezone.now()
    review.resolved_by = actor
    review.resolution_notes = resolution_notes
    review.save(
        update_fields=["status", "resolved_at", "resolved_by", "resolution_notes", "updated_at"]
    )

    audit_services.record(
        actor=actor,
        action="fraud_review.resolve",
        entity=review,
        previous_state=previous_state,
        new_state={"status": review.status},
        reason=resolution_notes,
    )
    return review


def create_review_from_events(*, actor, events, reason=""):
    """Groups a set of FraudEvent rows (all for one user) under a single
    FraudReview, opening or reusing the user's OPEN review. Shared by
    FraudEventAdmin's bulk action and the admin API.
    """
    events = list(events)
    users = {event.user_id for event in events}
    if len(users) != 1:
        raise ValidationError("All selected events must belong to a single user.")
    if not events:
        raise ValidationError("No events selected.")

    from apps.users.models import User

    user = User.objects.get(pk=users.pop())
    level, _ = assess_user(user)
    review = ensure_open_review(
        user,
        risk_level=level,
        reason=reason or f"Manually created from {len(events)} selected event(s)",
    )
    FraudEvent.objects.filter(pk__in=[e.pk for e in events]).update(review=review)

    audit_services.record(
        actor=actor,
        action="fraud_review.create_from_events",
        entity=review,
        new_state={"risk_level": review.risk_level, "event_count": len(events)},
        reason=reason,
    )
    return review
