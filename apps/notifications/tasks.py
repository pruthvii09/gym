import json

from celery import shared_task
from django.conf import settings

from apps.notifications import services
from apps.notifications.models import Notification, NotificationType, PushSubscription
from apps.notifications.push import send_web_push
from apps.rewards.models import RewardClaim, UserReward
from apps.users.models import User

# Where clicking a push notification of a given type should land in the
# frontend. Deliberately coarse (a section, not a specific object) -- the
# in-app notification list/mark-read flow is the place for anything more
# precise.
_DEEP_LINK_PATHS = {
    NotificationType.STREAK_MILESTONE: "/dashboard",
    NotificationType.REWARD_UNLOCKED: "/rewards",
    NotificationType.REWARD_SHIPPED: "/rewards",
    NotificationType.CHALLENGE: "/dashboard",
    NotificationType.NEW_FOLLOWER: "/profile",
    NotificationType.SYSTEM: "/dashboard",
}


@shared_task
def send_push_notification_task(notification_id):
    try:
        notification = Notification.objects.select_related("user").get(pk=notification_id)
    except Notification.DoesNotExist:
        return  # referenced row no longer exists -- safe no-op

    subscriptions = PushSubscription.objects.filter(
        user=notification.user, disabled_at__isnull=True
    )
    if not subscriptions:
        return

    path = _DEEP_LINK_PATHS.get(notification.type, "/dashboard")
    payload = json.dumps(
        {
            "title": notification.title,
            "body": notification.message,
            "url": f"{settings.FRONTEND_URL}{path}",
        }
    )
    for subscription in subscriptions:
        send_web_push(subscription=subscription, payload=payload)


@shared_task
def send_reward_unlocked_notification(user_reward_id):
    try:
        user_reward = UserReward.objects.select_related("user", "reward_definition").get(
            pk=user_reward_id
        )
    except UserReward.DoesNotExist:
        return  # referenced row no longer exists -- safe no-op

    services.notify(
        user=user_reward.user,
        notification_type=NotificationType.REWARD_UNLOCKED,
        title="Reward unlocked!",
        message=f"You've unlocked {user_reward.reward_definition.name}.",
        related_object=user_reward,
    )


@shared_task
def send_streak_milestone_notification(*, user_id, streak_value):
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    # No related_object: UserStreak is a singleton per user, so deduping on
    # that row would wrongly suppress every subsequent new-personal-best
    # after the first. The real dedupe guarantee lives at the call site
    # (apps.streaks.services.rebuild_user_streak only schedules this when a
    # genuinely new all-time-high is detected), not inside this task.
    services.notify(
        user=user,
        notification_type=NotificationType.STREAK_MILESTONE,
        title="New personal best!",
        message=f"You've reached a {streak_value}-day streak, your longest yet.",
    )


@shared_task
def send_reward_shipped_notification(claim_id):
    try:
        claim = RewardClaim.objects.select_related("user_reward__user").get(pk=claim_id)
    except RewardClaim.DoesNotExist:
        return

    services.notify(
        user=claim.user_reward.user,
        notification_type=NotificationType.REWARD_SHIPPED,
        title="Your reward has shipped",
        message="Your reward claim is on its way.",
        related_object=claim,
    )
