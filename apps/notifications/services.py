from django.db import IntegrityError

from apps.notifications.models import Notification


def notify(*, user, notification_type, title, message, related_object=None) -> Notification:
    """Creates (or, if related_object is given and one already exists for
    this exact event, returns) a Notification row. This is the idempotency
    guarantee every notification-creating Celery task relies on: a task
    retried/executed twice for the same event never creates a duplicate.
    """
    if related_object is None:
        return Notification.objects.create(
            user=user, type=notification_type, title=title, message=message
        )

    related_object_type = related_object.__class__.__name__.lower()
    related_object_id = related_object.pk
    try:
        notification, _ = Notification.objects.get_or_create(
            user=user,
            type=notification_type,
            related_object_type=related_object_type,
            related_object_id=related_object_id,
            defaults={"title": title, "message": message},
        )
    except IntegrityError:
        # Belt-and-suspenders: Django's get_or_create already retries
        # internally on IntegrityError, so this is largely redundant in
        # practice -- kept as defense-in-depth, consistent with this
        # codebase's existing pattern of an extra safety net around a
        # primary guarantee (e.g. the checkins savepoint pattern).
        notification = Notification.objects.get(
            user=user,
            type=notification_type,
            related_object_type=related_object_type,
            related_object_id=related_object_id,
        )
    return notification
