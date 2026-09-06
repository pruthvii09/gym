from celery import shared_task

from apps.badges.models import UserBadge
from apps.checkins.models import CheckIn
from apps.notifications import services as notification_services
from apps.notifications.models import NotificationType
from apps.social import services
from apps.social.models import ActivityType, Follow
from apps.users.models import User
from apps.workouts.models import WorkoutSession


@shared_task
def record_checkin_activity(checkin_id):
    try:
        checkin = CheckIn.objects.select_related("user").get(pk=checkin_id)
    except CheckIn.DoesNotExist:
        return  # referenced row no longer exists -- safe no-op

    services.record_activity(
        user=checkin.user, activity_type=ActivityType.CHECKIN, related_object=checkin
    )


@shared_task
def record_streak_milestone_activity(*, user_id, streak_value):
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    # No related_object: UserStreak is a singleton per user, so deduping on
    # that row would wrongly suppress every subsequent new-personal-best
    # after the first -- same reasoning as
    # apps.notifications.tasks.send_streak_milestone_notification. The real
    # dedupe guarantee is the call site only scheduling this on a genuine
    # new all-time-high.
    services.record_activity(
        user=user, activity_type=ActivityType.STREAK_MILESTONE, value=streak_value
    )


@shared_task
def record_badge_earned_activity(user_badge_id):
    try:
        user_badge = UserBadge.objects.select_related("user").get(pk=user_badge_id)
    except UserBadge.DoesNotExist:
        return

    services.record_activity(
        user=user_badge.user, activity_type=ActivityType.BADGE_EARNED, related_object=user_badge
    )


@shared_task
def record_workout_activity(session_id):
    try:
        session = WorkoutSession.objects.select_related("user").get(pk=session_id)
    except WorkoutSession.DoesNotExist:
        return

    services.record_activity(
        user=session.user, activity_type=ActivityType.WORKOUT_COMPLETED, related_object=session
    )


@shared_task
def send_new_follower_notification(follow_id):
    try:
        follow = Follow.objects.select_related("follower", "following").get(pk=follow_id)
    except Follow.DoesNotExist:
        return

    notification_services.notify(
        user=follow.following,
        notification_type=NotificationType.NEW_FOLLOWER,
        title="New follower",
        message=f"@{follow.follower.username} started following you.",
        related_object=follow,
    )
