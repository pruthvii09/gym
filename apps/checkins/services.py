"""The verified check-in flow.

CORE RULE: the frontend provides evidence, the backend decides whether the
check-in is valid. Nothing from the client determines the outcome -- status
and risk_score are always computed here, server-side.
"""

from dataclasses import dataclass, field

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from django.shortcuts import get_object_or_404

from apps.audit import services as audit_services
from apps.checkins.models import CheckIn
from apps.checkins.tasks import record_checkin_analytics
from apps.common.geo import haversine_distance_meters
from apps.fraud import services as fraud_services
from apps.fraud.models import FraudEvent
from apps.fraud.tasks import assess_and_flag_task
from apps.gyms import services as gym_services
from apps.gyms import tokens
from apps.gyms.models import CheckinSession, GymCheckinDevice, GymMembership
from apps.streaks import services as streak_services
from apps.streaks.models import UserStreak
from apps.users.services import record_device_login

MSG_INVALID = "This QR code is not valid."
MSG_EXPIRED = "This QR code has expired."
MSG_GYM_MISMATCH = "This QR code does not belong to the selected gym."
MSG_ALREADY_USED = "This QR code has already been used."
MSG_DEVICE_DISABLED = "This check-in device is disabled."
MSG_LOCATION = "You appear to be too far from the gym to check in."
MSG_DUPLICATE = "You've already checked in to this gym today."
MSG_NOT_MEMBER = "You're not a member of this gym."
MSG_VERIFIED = "Check-in verified."
MSG_REVIEW = "Check-in received and pending review."


@dataclass
class CheckinResult:
    checkin: CheckIn
    created: bool  # False => idempotent replay (view returns 200)
    message: str
    # Post-rebuild streak snapshot -- only set when this check-in was (or
    # already was) VERIFIED, i.e. it actually fed the streak calculation.
    streak: UserStreak | None = None
    # UserRewards newly created by *this* rebuild. Deliberately empty on an
    # idempotent replay (fast path or IntegrityError race below) even though
    # `streak` is still populated there -- a replay shouldn't re-announce a
    # reward the first response already delivered.
    rewards_unlocked: list = field(default_factory=list)


def create_checkin(
    *,
    user,
    gym,
    qr_token,
    latitude,
    longitude,
    location_accuracy=None,
    device_hash=None,
    platform=None,
    idempotency_key=None,
):
    # Idempotency fast path: outside any lock, pure optimization for the
    # common client-retry case. No QR/session work at all on this path.
    if idempotency_key:
        existing = CheckIn.objects.filter(user=user, idempotency_key=idempotency_key).first()
        if existing is not None:
            return CheckinResult(
                checkin=existing,
                created=False,
                message=_message_for(existing.status),
                streak=_current_streak_snapshot(user, existing.status),
            )

    # Cheap, independent upsert -- resolved early so even hard-rejected
    # branches get audit-quality device data, not just the success path.
    device = record_device_login(user, device_hash=device_hash, platform=platform)

    # Authorization gate, checked before any QR-session work -- there's no reason to
    # touch/lock a session for a request that isn't even permitted at this gym.
    is_member = GymMembership.objects.filter(
        user=user, gym=gym, status=GymMembership.Status.ACTIVE
    ).exists()
    if not is_member:
        return _persist(
            user=user,
            gym=gym,
            session=None,
            device=device,
            latitude=latitude,
            longitude=longitude,
            location_accuracy=location_accuracy,
            status=CheckIn.Status.REJECTED,
            idempotency_key=idempotency_key,
            message=MSG_NOT_MEMBER,
        )

    with transaction.atomic():
        session = _lock_session_for_token(qr_token)

        if session is None:
            return _persist(
                user=user,
                gym=gym,
                session=None,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_INVALID,
            )

        if session.expires_at <= timezone.now():
            return _persist(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_EXPIRED,
            )

        if session.gym_id != gym.id:
            return _persist(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_GYM_MISMATCH,
                fired_events=[
                    (
                        FraudEvent.EventType.SUSPICIOUS_PATTERN,
                        f"session gym={session.gym_id} claimed gym={gym.id}",
                    )
                ],
            )

        if session.status != CheckinSession.Status.ACTIVE:
            fired = [(FraudEvent.EventType.QR_REUSE, f"session status={session.status}")]
            return _persist(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_ALREADY_USED,
                fired_events=fired,
            )

        if session.device.status != GymCheckinDevice.Status.ACTIVE:
            return _persist(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_DEVICE_DISABLED,
            )

        # Genuinely fresh, valid, gym-matched: burn the QR now, before
        # location is even checked. Otherwise an attacker holding a
        # still-valid QR could retry with different spoofed coordinates
        # until one clears the geofence.
        session.status = CheckinSession.Status.CONSUMED
        session.save(update_fields=["status", "updated_at"])

        distance = haversine_distance_meters(
            latitude, longitude, gym.latitude, gym.longitude
        )
        allowed = gym.checkin_radius_meters + min(
            location_accuracy or 0, settings.CHECKIN_GPS_ACCURACY_ALLOWANCE_METERS
        )
        if distance > allowed:
            return _persist(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_LOCATION,
                fired_events=[
                    (
                        FraudEvent.EventType.GPS_MISMATCH,
                        f"distance={distance:.0f}m > allowed={allowed:.0f}m",
                    )
                ],
            )

        if _has_verified_today(user, gym):
            return _persist(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                status=CheckIn.Status.REJECTED,
                idempotency_key=idempotency_key,
                message=MSG_DUPLICATE,
                fired_events=[
                    (
                        FraudEvent.EventType.TOO_MANY_CHECKINS,
                        f"duplicate verified check-in at gym={gym.id} today",
                    )
                ],
            )

        risk_score, fired = fraud_services.score_checkin(
            user=user, gym=gym, device=device, location_accuracy=location_accuracy
        )
        final_status = (
            CheckIn.Status.REVIEW
            if risk_score >= settings.CHECKIN_RISK_HIGH_THRESHOLD
            else CheckIn.Status.VERIFIED
        )
        message = MSG_REVIEW if final_status == CheckIn.Status.REVIEW else MSG_VERIFIED

        return _persist(
            user=user,
            gym=gym,
            session=session,
            device=device,
            latitude=latitude,
            longitude=longitude,
            location_accuracy=location_accuracy,
            status=final_status,
            idempotency_key=idempotency_key,
            message=message,
            risk_score=risk_score,
            fired_events=fired,
        )


def _message_for(status):
    return {
        CheckIn.Status.VERIFIED: MSG_VERIFIED,
        CheckIn.Status.REVIEW: MSG_REVIEW,
        CheckIn.Status.REJECTED: "This check-in was not verified.",
        CheckIn.Status.PENDING: "Check-in pending.",
    }[status]


def _lock_session_for_token(qr_token):
    try:
        raw_value = tokens.unsign_token(qr_token)
    except signing.BadSignature:
        return None
    token_hash = tokens.hash_raw_value(raw_value)
    return (
        CheckinSession.objects.select_for_update()
        .select_related("device", "gym")
        .filter(token_hash=token_hash)
        .first()
    )


def _has_verified_today(user, gym):
    return CheckIn.objects.filter(
        user=user,
        gym=gym,
        status=CheckIn.Status.VERIFIED,
        checked_in_at__date=timezone.localdate(),
    ).exists()


def _current_streak_snapshot(user, checkin_status):
    # Only meaningful once VERIFIED -- a REVIEW/REJECTED check-in never
    # touched UserStreak, so returning a snapshot for it would misleadingly
    # imply the streak already reflects this attempt.
    if checkin_status != CheckIn.Status.VERIFIED:
        return None
    return UserStreak.objects.filter(user=user).first()


def _persist(
    *,
    user,
    gym,
    session,
    device,
    latitude,
    longitude,
    location_accuracy,
    status,
    idempotency_key,
    message,
    risk_score=0,
    fired_events=(),
):
    """Single exit point for every branch. Wraps the actual insert in a
    savepoint so a same-idempotency-key race loser can catch the
    IntegrityError and return the winner's row instead of a 500.
    """
    try:
        with transaction.atomic():
            checkin = CheckIn.objects.create(
                user=user,
                gym=gym,
                session=session,
                device=device,
                latitude=latitude,
                longitude=longitude,
                location_accuracy=location_accuracy,
                verification_method=CheckIn.VerificationMethod.QR,
                risk_score=risk_score,
                status=status,
                idempotency_key=idempotency_key,
            )
    except IntegrityError:
        checkin = CheckIn.objects.get(user=user, idempotency_key=idempotency_key)
        return CheckinResult(
            checkin=checkin,
            created=False,
            message=_message_for(checkin.status),
            streak=_current_streak_snapshot(user, checkin.status),
        )

    for event_type, details in fired_events:
        fraud_services.record_event(
            user=user, checkin=checkin, event_type=event_type, details=details
        )

    # Verified CheckIns are the source of truth for streaks; UserStreak is a
    # cached derivation. Filtering on status here (rather than only calling
    # this from the one current call site that produces VERIFIED) protects
    # against silently missing a future VERIFIED-producing branch.
    streak = None
    rewards_unlocked = []
    if checkin.status == CheckIn.Status.VERIFIED:
        streak = streak_services.rebuild_user_streak(user)
        rewards_unlocked = getattr(streak, "newly_earned_rewards", [])

    # User-level risk assessment, every outcome (a rejected attempt matters
    # for "repeated failed check-ins"). The only automatic consequence of a
    # HIGH result is opening a FraudReview for human attention -- never an
    # automatic ban. Async: the check-in's own status is already fully
    # decided and committed above; this is a separate side-effect the
    # current response never reads, so deferring it to a worker (accepting
    # a small eventual-consistency window) is safe.
    transaction.on_commit(lambda uid=user.id: assess_and_flag_task.delay(user_id=uid))

    # Analytics: demonstrative only, see apps.checkins.tasks docstring.
    transaction.on_commit(lambda cid=checkin.id: record_checkin_analytics.delay(checkin_id=cid))

    return CheckinResult(
        checkin=checkin,
        created=True,
        message=message,
        streak=streak,
        rewards_unlocked=rewards_unlocked,
    )


# --- Admin/operations -------------------------------------------------------

# A REVIEW check-in is a human decision point, not a state machine with many
# stages: staff resolve it one way or the other, terminally. Anything already
# VERIFIED/REJECTED was already the backend's own final decision and isn't
# second-guessable through this endpoint.
CHECKIN_ADMIN_RESOLVABLE_FROM = CheckIn.Status.REVIEW
CHECKIN_ADMIN_RESOLUTIONS = (CheckIn.Status.VERIFIED, CheckIn.Status.REJECTED)


def resolve_checkin(*, actor, checkin, new_status, reason=""):
    """Admin resolution of a CheckIn left in REVIEW by the fraud risk score.
    Verifying triggers the exact same streak-rebuild path a live verified
    check-in would (apps.streaks.services.rebuild_user_streak), so a
    manually-cleared check-in counts toward the streak/rewards identically
    to one that was auto-verified.
    """
    if checkin.status != CHECKIN_ADMIN_RESOLVABLE_FROM or new_status not in CHECKIN_ADMIN_RESOLUTIONS:
        raise ValidationError(
            f"Cannot resolve a check-in from '{checkin.status}' to '{new_status}'."
        )

    previous_state = {"status": checkin.status}
    checkin.status = new_status
    checkin.save(update_fields=["status", "updated_at"])

    audit_services.record(
        actor=actor,
        action="checkin.resolve",
        entity=checkin,
        previous_state=previous_state,
        new_state={"status": checkin.status},
        reason=reason,
    )

    if new_status == CheckIn.Status.VERIFIED:
        streak_services.rebuild_user_streak(checkin.user)

    return checkin


# --- Gym-staff member detail -------------------------------------------------
# Lives here (not apps.gyms.services) because it needs to read UserStreak and
# CheckIn, both of which already depend on apps.gyms -- the reverse import
# would be circular.

MEMBER_DETAIL_RECENT_CHECKINS_LIMIT = 15


def get_gym_member_detail(*, actor, gym, membership_id):
    """A gym staff member's view of one of their gym's members: the
    membership row, their streak snapshot, their rest-day setting, and
    their recent check-in history at this gym specifically (not every gym
    they've ever visited).
    """
    gym_services.assert_gym_staff(actor, gym)
    membership = get_object_or_404(
        GymMembership.objects.select_related("user"),
        pk=membership_id,
        gym=gym,
        role=GymMembership.Role.MEMBER,
    )
    streak, _ = UserStreak.objects.get_or_create(user=membership.user)
    rest_day = streak_services.get_or_create_rest_day(membership.user)
    recent_checkins = CheckIn.objects.filter(user=membership.user, gym=gym).order_by(
        "-checked_in_at"
    )[:MEMBER_DETAIL_RECENT_CHECKINS_LIMIT]
    return membership, streak, rest_day, recent_checkins
