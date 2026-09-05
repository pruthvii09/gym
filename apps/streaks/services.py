from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.forms.models import model_to_dict
from django.utils import timezone

from apps.audit import services as audit_services
from apps.checkins.models import CheckIn
from apps.notifications.tasks import send_streak_milestone_notification
from apps.rewards import services as reward_services
from apps.streaks import calculator
from apps.streaks.models import StreakPolicy, UserStreak

CALENDAR_DEFAULT_RANGE_DAYS = 90
CALENDAR_MAX_RANGE_DAYS = 366

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
    with transaction.atomic():
        streak, _ = UserStreak.objects.select_for_update().get_or_create(user=user)
        previous_longest = streak.longest_streak  # capture before overwrite, below

        timestamps = (
            CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED)
            .order_by("checked_in_at")
            .values_list("checked_in_at", flat=True)
        )
        gym_days = sorted({calculator.gym_day(ts, policy.grace_period) for ts in timestamps})
        result = calculator.calculate_streak(gym_days, policy, timezone.localdate())

        streak.current_streak = result.current_streak
        streak.longest_streak = result.longest_streak
        streak.last_activity_date = result.last_activity_date
        streak.save(
            update_fields=["current_streak", "longest_streak", "last_activity_date", "updated_at"]
        )

        reward_services.evaluate_rewards(user, streak)

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
