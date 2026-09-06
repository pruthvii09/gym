"""Achievement badge evaluation.

CORE RULE: like apps.rewards.services.evaluate_rewards, badge eligibility is
always computed here from stored data -- never trust a client-asserted
count. Badges are sticky once earned, same as rewards: dropping back below a
threshold later never claws one back (UserBadge is never deleted here).
"""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.badges.models import Badge, UserBadge
from apps.social.tasks import record_badge_earned_activity

FEATURED_BADGE_LIMIT = 2

FEATURED_LIMIT_MSG = f"You can only feature up to {FEATURED_BADGE_LIMIT} badges at a time."
NOT_OWNED_MSG = "You haven't earned one of the selected badges."


def _current_metric_value(user, metric: str) -> int:
    """One branch per Badge.Metric value. Local imports avoid new
    module-level cross-app edges for a handful of straight-line queries --
    the same reasoning apps.rewards.services._check_reward_protection uses
    for its own local CheckIn import.
    """
    if metric == Badge.Metric.CURRENT_STREAK or metric == Badge.Metric.LONGEST_STREAK:
        from apps.streaks.models import UserStreak

        streak = UserStreak.objects.filter(user=user).first()
        if streak is None:
            return 0
        return streak.current_streak if metric == Badge.Metric.CURRENT_STREAK else streak.longest_streak

    if metric == Badge.Metric.TOTAL_CHECKINS:
        from apps.checkins.models import CheckIn

        return CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED).count()

    if metric == Badge.Metric.TOTAL_WORKOUTS:
        from apps.workouts.models import WorkoutSession

        return WorkoutSession.objects.filter(
            user=user, status=WorkoutSession.Status.COMPLETED
        ).count()

    if metric == Badge.Metric.TOTAL_SETS:
        from apps.workouts.models import ExerciseSet, WorkoutSession

        return ExerciseSet.objects.filter(
            session_exercise__session__user=user,
            session_exercise__session__status=WorkoutSession.Status.COMPLETED,
        ).count()

    if metric == Badge.Metric.REWARDS_EARNED:
        from apps.rewards.models import UserReward

        return UserReward.objects.filter(user=user).count()

    return 0


def evaluate_badges(user) -> list[UserBadge]:
    """Create a new UserBadge for every active Badge the user newly
    qualifies for. Idempotent via UserBadge's unique_together(user, badge),
    same shape as apps.rewards.services.evaluate_rewards. Called from
    apps.streaks.services.rebuild_user_streak (covers streak/check-in/
    reward-driven badges) and apps.workouts.services.finish_session (covers
    workout/set-driven badges).
    """
    already_earned_ids = UserBadge.objects.filter(user=user).values_list("badge_id", flat=True)
    candidates = Badge.objects.filter(is_active=True).exclude(id__in=already_earned_ids)

    newly_earned = []
    metric_values: dict[str, int] = {}
    for badge in candidates:
        if badge.metric not in metric_values:
            metric_values[badge.metric] = _current_metric_value(user, badge.metric)
        if metric_values[badge.metric] >= badge.threshold:
            user_badge, created = UserBadge.objects.get_or_create(user=user, badge=badge)
            if created:
                newly_earned.append(user_badge)
                transaction.on_commit(
                    lambda ubid=user_badge.id: record_badge_earned_activity.delay(
                        user_badge_id=ubid
                    )
                )
    return newly_earned


def badge_progress(user):
    """Every active badge paired with the user's current progress toward it
    -- powers the profile's badge gallery (locked badges show a progress
    bar). Returns a list of {badge, user_badge, current_value} dicts, not a
    dataclass: no other caller needs a stricter shape.
    """
    earned_by_badge_id = {
        ub.badge_id: ub for ub in UserBadge.objects.filter(user=user).select_related("badge")
    }
    badges = Badge.objects.filter(is_active=True)
    metric_values: dict[str, int] = {}
    progress = []
    for badge in badges:
        user_badge = earned_by_badge_id.get(badge.id)
        if user_badge is not None:
            current_value = badge.threshold
        else:
            if badge.metric not in metric_values:
                metric_values[badge.metric] = _current_metric_value(user, badge.metric)
            current_value = metric_values[badge.metric]
        progress.append({"badge": badge, "user_badge": user_badge, "current_value": current_value})
    return progress


def set_featured(*, user, badge_ids: list[str]) -> list[UserBadge]:
    """Replace the user's featured-badge set. Validates the count (<=2) and
    that every id is actually one of the user's own earned badges before
    touching anything -- an all-or-nothing replace, not a per-id toggle, so
    a partial failure never leaves a stale mix of old/new featured badges.
    """
    if len(badge_ids) > FEATURED_BADGE_LIMIT:
        raise ValidationError(FEATURED_LIMIT_MSG)

    owned = list(UserBadge.objects.filter(user=user, badge_id__in=badge_ids))
    if len(owned) != len(set(badge_ids)):
        raise ValidationError(NOT_OWNED_MSG)

    UserBadge.objects.filter(user=user).update(is_featured=False)
    UserBadge.objects.filter(user=user, badge_id__in=badge_ids).update(is_featured=True)
    return list(UserBadge.objects.filter(user=user, is_featured=True).select_related("badge"))


def featured_badges_for(user, limit=FEATURED_BADGE_LIMIT):
    return list(
        UserBadge.objects.filter(user=user, is_featured=True)
        .select_related("badge")
        .order_by("earned_at")[:limit]
    )


def total_badge_count(user) -> int:
    return UserBadge.objects.filter(user=user).count()
