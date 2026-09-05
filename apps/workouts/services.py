"""Workout session logging.

CORE RULE: starting a session always re-derives eligibility (today's
verified check-in) from the database -- never trust a client-supplied
check-in id or "I'm at the gym" claim.
"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.checkins.models import CheckIn
from apps.gyms import services as gym_services
from apps.gyms.models import GymMembership
from apps.workouts.models import ExerciseSet, SessionExercise, WorkoutSession

NOT_CHECKED_IN_MSG = "Check in at your gym before starting a workout."
ALREADY_ACTIVE_MSG = "Finish your current workout before starting another."
NOT_ACTIVE_MSG = "This workout has already finished."
INACTIVE_EXERCISE_MSG = "This exercise is no longer available."

MEMBER_SUMMARY_RECENT_LIMIT = 10


def start_session(user):
    if WorkoutSession.objects.filter(user=user, status=WorkoutSession.Status.ACTIVE).exists():
        raise ValidationError(ALREADY_ACTIVE_MSG)

    # Same "verified today" check apps.checkins.services._has_verified_today
    # uses -- deliberately not gym-scoped here (any of the user's gyms
    # counts), since GymMembership/CheckIn already only exist for gyms the
    # user actually belongs to.
    todays_checkin = (
        CheckIn.objects.filter(
            user=user,
            status=CheckIn.Status.VERIFIED,
            checked_in_at__date=timezone.localdate(),
        )
        .order_by("-checked_in_at")
        .first()
    )
    if todays_checkin is None:
        raise ValidationError(NOT_CHECKED_IN_MSG)

    return WorkoutSession.objects.create(
        user=user,
        checkin=todays_checkin,
        gym=todays_checkin.gym,
        started_at=timezone.now(),
    )


def _assert_active(session):
    if session.status != WorkoutSession.Status.ACTIVE:
        raise ValidationError(NOT_ACTIVE_MSG)


def add_exercise(*, session, exercise):
    _assert_active(session)
    if not exercise.is_active:
        raise ValidationError(INACTIVE_EXERCISE_MSG)

    with transaction.atomic():
        last_order = (
            SessionExercise.objects.filter(session=session)
            .order_by("-order")
            .values_list("order", flat=True)
            .first()
        )
        return SessionExercise.objects.create(
            session=session, exercise=exercise, order=(last_order or 0) + 1
        )


def add_set(*, session_exercise, reps, weight_kg=None):
    _assert_active(session_exercise.session)

    with transaction.atomic():
        last_number = (
            ExerciseSet.objects.filter(session_exercise=session_exercise)
            .order_by("-set_number")
            .values_list("set_number", flat=True)
            .first()
        )
        return ExerciseSet.objects.create(
            session_exercise=session_exercise,
            set_number=(last_number or 0) + 1,
            reps=reps,
            weight_kg=weight_kg,
        )


def delete_set(*, session_exercise, exercise_set):
    _assert_active(session_exercise.session)
    exercise_set.delete()


def finish_session(session):
    _assert_active(session)
    session.ended_at = timezone.now()
    session.status = WorkoutSession.Status.COMPLETED
    session.save(update_fields=["ended_at", "status", "updated_at"])
    return session


def cancel_session(session):
    _assert_active(session)
    session.ended_at = timezone.now()
    session.status = WorkoutSession.Status.CANCELLED
    session.save(update_fields=["ended_at", "status", "updated_at"])
    return session


def get_member_workout_history(user):
    return (
        WorkoutSession.objects.filter(user=user)
        .select_related("gym")
        .prefetch_related("exercises__exercise", "exercises__sets")
        .order_by("-started_at")
    )


# --- Gym-staff member detail -------------------------------------------------
# Lives here, not apps.gyms.services, for the same reason
# apps.checkins.services.get_gym_member_detail does: needs to read
# WorkoutSession, which already depends on apps.gyms -- the reverse import
# would be circular.


def get_member_workout_summary(*, actor, gym, membership_id):
    gym_services.assert_gym_staff(actor, gym)
    membership = get_object_or_404(
        GymMembership, pk=membership_id, gym=gym, role=GymMembership.Role.MEMBER
    )
    return (
        WorkoutSession.objects.filter(user=membership.user, gym=gym)
        .prefetch_related("exercises__exercise", "exercises__sets")
        .order_by("-started_at")[:MEMBER_SUMMARY_RECENT_LIMIT]
    )
