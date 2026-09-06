"""Read-only cross-app reporting. No models of its own -- every function
here aggregates over models owned by other apps, the same way
apps.checkins.services already reaches into apps.streaks/apps.fraud/
apps.gyms. Nothing here ever writes.
"""

from collections import Counter
from datetime import timedelta

from django.db.models import Avg, Count, DateField, Min, Sum
from django.db.models.functions import ExtractHour, ExtractWeekDay, TruncDate, TruncWeek
from django.utils import timezone

from apps.checkins.models import CheckIn
from apps.fraud.models import FraudReview
from apps.gyms import services as gym_services
from apps.gyms.models import Gym, GymMembership
from apps.rewards.models import UserReward
from apps.streaks.models import UserStreak
from apps.users.models import User
from apps.workouts.models import ExerciseSet, WorkoutSession

DAILY = "daily"
WEEKLY = "weekly"

STREAK_DISTRIBUTION_BUCKETS = [
    ("0", 0, 0),
    ("1-6", 1, 6),
    ("7-29", 7, 29),
    ("30-99", 30, 99),
    ("100+", 100, None),
]


def parse_range(range_param):
    """Returns (start_date | None, end_date, granularity). start=None means
    "all" -- resolved per-queryset by _resolve_start, since different
    metrics' earliest rows don't necessarily share one start date.
    """
    today = timezone.localdate()
    if range_param == "7d":
        return today - timedelta(days=6), today, DAILY
    if range_param == "90d":
        return today - timedelta(days=89), today, WEEKLY
    if range_param == "all":
        return None, today, WEEKLY
    return today - timedelta(days=29), today, DAILY  # default: 30d


def _trunc(date_field, granularity):
    # Forcing output_field=DateField() matters: TruncDate on a DateTimeField
    # already returns a plain date, but TruncWeek does NOT -- it returns a
    # datetime (midnight, tz-aware), which will never equality-match the
    # plain `date` objects the zero-fill loop below generates. Without this,
    # every weekly-granularity bucket silently reads back as zero.
    trunc_cls = TruncDate if granularity == DAILY else TruncWeek
    return trunc_cls(date_field, output_field=DateField())


def _resolve_start(queryset, date_field, start, end):
    if start is not None:
        return start
    earliest = queryset.aggregate(v=Min(date_field))["v"]
    return earliest.date() if earliest else end


def bucketed_counts(queryset, date_field, start, end, granularity):
    """[{period: 'YYYY-MM-DD', count: N}, ...] for every bucket in
    [start, end], zero-filled -- a chart should never show a misleading
    gap for a day/week with no activity.
    """
    start = _resolve_start(queryset, date_field, start, end)
    scoped = queryset.filter(**{f"{date_field}__date__gte": start, f"{date_field}__date__lte": end})
    rows = (
        scoped.annotate(period=_trunc(date_field, granularity))
        .values("period")
        .annotate(count=Count("id"))
        .order_by("period")
    )
    counts_by_period = {row["period"]: row["count"] for row in rows}

    step = timedelta(days=1) if granularity == DAILY else timedelta(days=7)
    # TruncWeek buckets to the ISO week start (Monday) -- align the
    # generated period list to the same anchor so lookups actually hit.
    current = start - timedelta(days=start.weekday()) if granularity == WEEKLY else start

    buckets = []
    while current <= end:
        buckets.append({"period": current.isoformat(), "count": counts_by_period.get(current, 0)})
        current += step
    return buckets


def _cumulative(buckets, baseline):
    running = baseline
    result = []
    for bucket in buckets:
        running += bucket["count"]
        result.append({"period": bucket["period"], "count": running})
    return result


# --- Member ------------------------------------------------------------------


def get_member_analytics(user, range_param):
    start, end, granularity = parse_range(range_param)

    checkins_over_time = bucketed_counts(
        CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED),
        "checked_in_at",
        start,
        end,
        granularity,
    )

    completed_sets = ExerciseSet.objects.filter(
        session_exercise__session__user=user,
        session_exercise__session__status=WorkoutSession.Status.COMPLETED,
    )
    workout_volume_start = _resolve_start(completed_sets, "created_at", start, end)
    volume_buckets = bucketed_counts(completed_sets, "created_at", workout_volume_start, end, granularity)
    weight_rows = (
        completed_sets.filter(
            created_at__date__gte=workout_volume_start, created_at__date__lte=end
        )
        .annotate(period=_trunc("created_at", granularity))
        .values("period")
        .annotate(total_weight_kg=Sum("weight_kg"))
    )
    weight_by_period = {row["period"]: row["total_weight_kg"] or 0 for row in weight_rows}
    workout_volume_over_time = [
        {
            "period": b["period"],
            "sets": b["count"],
            "total_weight_kg": float(weight_by_period.get(_parse_iso_date(b["period"]), 0)),
        }
        for b in volume_buckets
    ]

    muscle_sets = (
        ExerciseSet.objects.filter(
            session_exercise__session__user=user,
            session_exercise__session__status=WorkoutSession.Status.COMPLETED,
            created_at__date__gte=start or timezone.localdate() - timedelta(days=3650),
            created_at__date__lte=end,
        )
        .select_related("session_exercise__exercise")
        .values_list("session_exercise__exercise__primary_muscles", flat=True)
    )
    muscle_counter = Counter()
    for muscles in muscle_sets:
        for muscle in muscles:
            muscle_counter[muscle] += 1
    muscle_set_counts = [
        {"muscle": muscle, "sets": count} for muscle, count in muscle_counter.most_common()
    ]

    rewards_earned_over_time = bucketed_counts(
        UserReward.objects.filter(user=user), "earned_at", start, end, granularity
    )

    streak, _ = UserStreak.objects.get_or_create(user=user)
    total_checkins = CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED).count()
    total_workouts = WorkoutSession.objects.filter(
        user=user, status=WorkoutSession.Status.COMPLETED
    ).count()
    total_sets = completed_sets.count()
    favorite = (
        CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED)
        .values("gym__name")
        .annotate(count=Count("id"))
        .order_by("-count")
        .first()
    )

    return {
        "range": {"start": start.isoformat() if start else None, "end": end.isoformat()},
        "checkins_over_time": checkins_over_time,
        "workout_volume_over_time": workout_volume_over_time,
        "muscle_set_counts": muscle_set_counts,
        "rewards_earned_over_time": rewards_earned_over_time,
        "stats": {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "total_checkins": total_checkins,
            "total_workouts": total_workouts,
            "total_sets": total_sets,
            "favorite_gym_name": favorite["gym__name"] if favorite else None,
        },
    }


def _parse_iso_date(value):
    from datetime import date

    return date.fromisoformat(value)


# --- Gym staff -----------------------------------------------------------


def get_gym_analytics(*, gym, actor, range_param):
    gym_services.assert_gym_staff(actor, gym)
    start, end, granularity = parse_range(range_param)

    checkins_over_time = bucketed_counts(
        CheckIn.objects.filter(gym=gym, status=CheckIn.Status.VERIFIED),
        "checked_in_at",
        start,
        end,
        granularity,
    )

    active_memberships = GymMembership.objects.filter(
        gym=gym, role=GymMembership.Role.MEMBER, status=GymMembership.Status.ACTIVE
    )
    growth_start = _resolve_start(active_memberships, "created_at", start, end)
    baseline = active_memberships.filter(created_at__date__lt=growth_start).count()
    member_growth = _cumulative(
        bucketed_counts(active_memberships, "created_at", growth_start, end, granularity), baseline
    )

    heatmap_rows = (
        CheckIn.objects.filter(gym=gym, status=CheckIn.Status.VERIFIED)
        .annotate(dow=ExtractWeekDay("checked_in_at"), hour=ExtractHour("checked_in_at"))
        .values("dow", "hour")
        .annotate(count=Count("id"))
    )
    # dow: Django's ExtractWeekDay is 1=Sunday..7=Saturday -- passed through
    # as-is; the frontend converts to a JS Date weekday with a plain -1.
    checkin_heatmap = [
        {"day_of_week": row["dow"], "hour": row["hour"], "count": row["count"]} for row in heatmap_rows
    ]

    rewards_earned_over_time = bucketed_counts(
        UserReward.objects.filter(user__gym_memberships__gym=gym), "earned_at", start, end, granularity
    )

    total_members = active_memberships.count()
    week_ago = timezone.now() - timedelta(days=7)
    active_this_week = (
        CheckIn.objects.filter(
            gym=gym, status=CheckIn.Status.VERIFIED, checked_in_at__gte=week_ago
        )
        .values("user_id")
        .distinct()
        .count()
    )
    average_current_streak = (
        UserStreak.objects.filter(user_id__in=active_memberships.values_list("user_id", flat=True))
        .aggregate(v=Avg("current_streak"))["v"]
        or 0
    )
    month_start = timezone.localdate() - timedelta(days=29)
    checkins_this_month = CheckIn.objects.filter(
        gym=gym, status=CheckIn.Status.VERIFIED, checked_in_at__date__gte=month_start
    ).count()

    return {
        "range": {"start": start.isoformat() if start else None, "end": end.isoformat()},
        "checkins_over_time": checkins_over_time,
        "member_growth": member_growth,
        "checkin_heatmap": checkin_heatmap,
        "rewards_earned_over_time": rewards_earned_over_time,
        "stats": {
            "total_members": total_members,
            "active_members_this_week": active_this_week,
            "inactive_members_this_week": max(total_members - active_this_week, 0),
            "average_current_streak": round(average_current_streak, 1),
            "checkins_this_month": checkins_this_month,
        },
    }


# --- Platform (admin) ------------------------------------------------------


def get_platform_analytics(range_param):
    start, end, granularity = parse_range(range_param)

    checkins_over_time = bucketed_counts(
        CheckIn.objects.filter(status=CheckIn.Status.VERIFIED), "checked_in_at", start, end, granularity
    )
    signups_over_time = bucketed_counts(User.objects.all(), "created_at", start, end, granularity)

    streak_distribution = []
    for label, lo, hi in STREAK_DISTRIBUTION_BUCKETS:
        qs = UserStreak.objects.filter(current_streak__gte=lo)
        if hi is not None:
            qs = qs.filter(current_streak__lte=hi)
        streak_distribution.append({"bucket": label, "count": qs.count()})

    fraud_start = _resolve_start(FraudReview.objects.all(), "created_at", start, end)
    fraud_statuses = [
        FraudReview.Status.OPEN,
        FraudReview.Status.APPROVED,
        FraudReview.Status.REJECTED,
    ]
    fraud_series = {
        s: bucketed_counts(FraudReview.objects.filter(status=s), "created_at", fraud_start, end, granularity)
        for s in fraud_statuses
    }
    # str(s), not the bare TextChoices member -- it's a str subclass so this
    # mostly "works" by accident either way, but the API response should
    # carry plain "open"/"approved"/"rejected" keys, not rely on that.
    fraud_reviews_over_time = [
        {
            "period": fraud_series[fraud_statuses[0]][i]["period"],
            **{str(s): fraud_series[s][i]["count"] for s in fraud_statuses},
        }
        for i in range(len(fraud_series[fraud_statuses[0]]))
    ]

    top_gyms_qs = CheckIn.objects.filter(status=CheckIn.Status.VERIFIED)
    if start is not None:
        top_gyms_qs = top_gyms_qs.filter(checked_in_at__date__gte=start, checked_in_at__date__lte=end)
    top_gyms_by_checkins = [
        {"gym_name": row["gym__name"], "count": row["count"]}
        for row in top_gyms_qs.values("gym__name").annotate(count=Count("id")).order_by("-count")[:10]
    ]

    return {
        "range": {"start": start.isoformat() if start else None, "end": end.isoformat()},
        "checkins_over_time": checkins_over_time,
        "signups_over_time": signups_over_time,
        "streak_distribution": streak_distribution,
        "fraud_reviews_over_time": fraud_reviews_over_time,
        "top_gyms_by_checkins": top_gyms_by_checkins,
        "stats": {
            "total_users": User.objects.count(),
            "total_gyms": Gym.objects.filter(status=Gym.Status.ACTIVE).count(),
            "pending_gyms": Gym.objects.filter(status=Gym.Status.PENDING).count(),
            "total_checkins_all_time": CheckIn.objects.filter(status=CheckIn.Status.VERIFIED).count(),
            "open_fraud_reviews": FraudReview.objects.filter(status=FraudReview.Status.OPEN).count(),
            "total_workouts_logged": WorkoutSession.objects.filter(
                status=WorkoutSession.Status.COMPLETED
            ).count(),
        },
    }
