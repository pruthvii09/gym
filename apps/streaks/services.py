from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.forms.models import model_to_dict
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit import services as audit_services
from apps.checkins.models import CheckIn
from apps.notifications.tasks import send_streak_milestone_notification
from apps.rewards import services as reward_services
from apps.streaks import calculator
from apps.streaks.models import StreakPolicy, UserRestDay, UserStreak

CALENDAR_DEFAULT_RANGE_DAYS = 90
CALENDAR_MAX_RANGE_DAYS = 366

# Lifetime cap on self-service rest-day changes -- a gym-staff override
# resets a user's count back to 0 (see set_rest_day), so this only ever
# limits how many times a member can change it themselves without help.
REST_DAY_SELF_SERVICE_LIMIT = 2

REST_DAY_LIMIT_REACHED_MSG = (
    f"You've used all {REST_DAY_SELF_SERVICE_LIMIT} rest-day changes. "
    "Ask your gym staff to update it for you."
)

# Fallback only -- shouldn't be hit given the seed migration, but the
# calculator shouldn't crash if the StreakPolicy table is somehow empty.
DEFAULT_POLICY = calculator.StreakPolicyData(
    minimum_days_per_week=2, allowed_rest_days=1, grace_period=120, freeze_count=2
)


def get_active_policy() -> calculator.StreakPolicyData:
    policy = StreakPolicy.objects.first()
    if policy is None:
        return DEFAULT_POLICY
    return calculator.StreakPolicyData(
        minimum_days_per_week=policy.minimum_days_per_week,
        allowed_rest_days=policy.allowed_rest_days,
        grace_period=policy.grace_period,
        freeze_count=policy.freeze_count,
    )


def rebuild_user_streak(user) -> UserStreak:
    """The only calculation path -- called identically from the check-in
    hook, the rebuild_streaks management command, and the admin action.
    Always fully recomputes from verified CheckIn history; never increments.
    """
    policy = get_active_policy()
    rest_day = UserRestDay.objects.filter(user=user).first()
    rest_day_of_week = rest_day.day_of_week if rest_day else None
    with transaction.atomic():
        streak, _ = UserStreak.objects.select_for_update().get_or_create(user=user)
        previous_longest = streak.longest_streak  # capture before overwrite, below

        timestamps = (
            CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED)
            .order_by("checked_in_at")
            .values_list("checked_in_at", flat=True)
        )
        gym_days = sorted({calculator.gym_day(ts, policy.grace_period) for ts in timestamps})
        result = calculator.calculate_streak(
            gym_days, policy, timezone.localdate(), rest_day_of_week=rest_day_of_week
        )

        streak.current_streak = result.current_streak
        streak.longest_streak = result.longest_streak
        streak.last_activity_date = result.last_activity_date
        streak.save(
            update_fields=["current_streak", "longest_streak", "last_activity_date", "updated_at"]
        )

        # Attached to the returned instance (not a new return type) so every
        # existing caller -- the admin action, the management command, the
        # bulk rebuild -- keeps working unchanged; only the check-in path
        # (apps.checkins.services) reads this, to show what a check-in just
        # unlocked instead of making the user find out on the dashboard.
        streak.newly_earned_rewards = reward_services.evaluate_rewards(user, streak)

        if result.longest_streak > previous_longest:
            transaction.on_commit(
                lambda uid=user.id, val=result.longest_streak: send_streak_milestone_notification.delay(
                    user_id=uid, streak_value=val
                )
            )

        return streak


def get_calendar(user, start: date, end: date) -> dict:
    policy = get_active_policy()
    grace = timedelta(minutes=policy.grace_period)

    # Query in checked_in_at-space using the same grace-period shift the
    # calculator applies, so a check-in lands in the same gym-day bucket
    # here as it did in the streak calculation.
    lower = datetime.combine(start, time.min, tzinfo=timezone.get_current_timezone()) + grace
    upper = (
        datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.get_current_timezone())
        + grace
    )

    rows = CheckIn.objects.filter(
        user=user,
        status=CheckIn.Status.VERIFIED,
        checked_in_at__gte=lower,
        checked_in_at__lt=upper,
    ).values_list("checked_in_at", "gym_id")

    buckets: dict[date, dict] = {}
    for checked_in_at, gym_id in rows:
        day = calculator.gym_day(checked_in_at, policy.grace_period)
        bucket = buckets.setdefault(day, {"count": 0, "gym_ids": []})
        bucket["count"] += 1
        bucket["gym_ids"].append(str(gym_id))

    days = []
    current = start
    while current <= end:
        bucket = buckets.get(current)
        days.append(
            {
                "date": current.isoformat(),
                "checked_in": bucket is not None,
                "checkin_count": bucket["count"] if bucket else 0,
                "gym_ids": bucket["gym_ids"] if bucket else [],
            }
        )
        current += timedelta(days=1)

    streak, _ = UserStreak.objects.get_or_create(user=user)

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "streak": {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "last_activity_date": (
                streak.last_activity_date.isoformat() if streak.last_activity_date else None
            ),
        },
        "days": days,
    }


# --- Rest day ----------------------------------------------------------------


def get_or_create_rest_day(user) -> UserRestDay:
    rest_day, _ = UserRestDay.objects.get_or_create(user=user)
    return rest_day


def set_rest_day(*, actor, user, day_of_week, is_self_service, reason=""):
    """day_of_week is None (clear) or 0-6 (Monday..Sunday). Self-service
    changes are capped at REST_DAY_SELF_SERVICE_LIMIT, lifetime. A
    staff-driven override (is_self_service=False) isn't capped and instead
    resets self_service_changes_used back to 0 -- a support lever for a
    member who's used up their own changes -- and is audited, same as every
    other admin-driven mutation in this codebase.

    Either path ends by calling rebuild_user_streak so the change applies
    retroactively immediately, consistent with that function's "always
    fully recomputes" contract.
    """
    if day_of_week is not None and not (0 <= day_of_week <= 6):
        raise ValidationError("day_of_week must be between 0 and 6.")

    with transaction.atomic():
        rest_day, _ = UserRestDay.objects.select_for_update().get_or_create(user=user)
        previous_state = {
            "day_of_week": rest_day.day_of_week,
            "self_service_changes_used": rest_day.self_service_changes_used,
        }

        if is_self_service:
            if rest_day.self_service_changes_used >= REST_DAY_SELF_SERVICE_LIMIT:
                raise ValidationError(REST_DAY_LIMIT_REACHED_MSG)
            rest_day.day_of_week = day_of_week
            rest_day.self_service_changes_used += 1
            rest_day.save(update_fields=["day_of_week", "self_service_changes_used", "updated_at"])
        else:
            rest_day.day_of_week = day_of_week
            rest_day.self_service_changes_used = 0
            rest_day.save(update_fields=["day_of_week", "self_service_changes_used", "updated_at"])
            audit_services.record(
                actor=actor,
                action="streak.rest_day.staff_override",
                entity=rest_day,
                previous_state=previous_state,
                new_state={"day_of_week": rest_day.day_of_week, "self_service_changes_used": 0},
                reason=reason,
            )

    rebuild_user_streak(user)
    return rest_day


# --- Admin/operations -------------------------------------------------------


def admin_rebuild_streak(*, actor, user):
    """Single-user rebuild, audited. Delegates to the one calculation path
    (rebuild_user_streak) -- same guarantee as the management command/admin
    bulk action, just also logged.
    """
    streak = rebuild_user_streak(user)
    audit_services.record(
        actor=actor,
        action="streak.rebuild",
        entity=streak,
        new_state={"current_streak": streak.current_streak, "longest_streak": streak.longest_streak},
    )
    return streak


def admin_rebuild_all_streaks(*, actor):
    """Bulk equivalent of the rebuild_streaks management command, reachable
    from the admin API. One audit entry summarizing the whole run, not one
    per user -- a per-user entry would just be noise for what's really a
    single operator action.
    """
    from apps.users.models import User

    users = User.objects.filter(checkins__status=CheckIn.Status.VERIFIED).distinct()
    count = 0
    for user in users:
        rebuild_user_streak(user)
        count += 1

    # The active StreakPolicy (a singleton, always present per the seed
    # migration) stands in as the audit entity: this action has no single
    # natural row of its own, and the policy is the thing every rebuilt
    # streak was computed against.
    audit_services.record(
        actor=actor,
        action="streak.rebuild_all",
        entity=StreakPolicy.objects.first(),
        new_state={"user_count": count},
    )
    return count


def admin_update_policy(*, actor, policy, **fields):
    previous_state = model_to_dict(policy)
    for field, value in fields.items():
        setattr(policy, field, value)
    policy.save()
    audit_services.record(
        actor=actor,
        action="streak_policy.update",
        entity=policy,
        previous_state=previous_state,
        new_state=model_to_dict(policy),
    )
    return policy
