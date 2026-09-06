from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from apps.social.models import ActivityItem, Follow

SELF_FOLLOW_MSG = "You can't follow yourself."


def follow_user(*, follower, target) -> tuple[Follow, bool]:
    """Idempotent: following someone twice is a no-op, not an error -- lets
    the frontend fire-and-forget a follow click without checking state
    first. The self-follow guard is enforced here AND at the DB level
    (Follow.Meta.constraints' no_self_follow CheckConstraint), same
    belt-and-suspenders shape as apps.notifications.services.notify's
    IntegrityError fallback.
    """
    if follower.pk == target.pk:
        raise ValidationError(SELF_FOLLOW_MSG)

    follow, created = Follow.objects.get_or_create(follower=follower, following=target)
    if created:
        from apps.social.tasks import send_new_follower_notification

        transaction.on_commit(
            lambda fid=follow.id: send_new_follower_notification.delay(follow_id=fid)
        )
    return follow, created


def unfollow_user(*, follower, target) -> None:
    Follow.objects.filter(follower=follower, following=target).delete()


def is_following(follower, target) -> bool:
    if follower.pk == target.pk:
        return False
    return Follow.objects.filter(follower=follower, following=target).exists()


def follower_count(user) -> int:
    return Follow.objects.filter(following=user).count()


def following_count(user) -> int:
    return Follow.objects.filter(follower=user).count()


def followed_user_ids(user):
    return Follow.objects.filter(follower=user).values_list("following_id", flat=True)


def record_activity(*, user, activity_type, related_object=None, value=None) -> ActivityItem:
    """Creates (or, if related_object is given and one already exists for
    this exact event, returns) an ActivityItem row -- copy of
    apps.notifications.services.notify's dedupe guarantee, so a retried
    Celery task never double-posts the same achievement to the feed.
    """
    if related_object is None:
        return ActivityItem.objects.create(user=user, type=activity_type, value=value)

    related_object_type = related_object.__class__.__name__.lower()
    related_object_id = related_object.pk
    try:
        item, _ = ActivityItem.objects.get_or_create(
            user=user,
            type=activity_type,
            related_object_type=related_object_type,
            related_object_id=related_object_id,
        )
    except IntegrityError:
        item = ActivityItem.objects.get(
            user=user,
            type=activity_type,
            related_object_type=related_object_type,
            related_object_id=related_object_id,
        )
    return item


def get_feed(*, user):
    return ActivityItem.objects.filter(
        user_id__in=followed_user_ids(user)
    ).select_related("user")
