from django.db import IntegrityError, transaction

from apps.notifications.models import Notification


def notify(*, user, notification_type, title, message, related_object=None) -> Notification:
    """Creates (or, if related_object is given and one already exists for
    this exact event, returns) a Notification row. This is the idempotency
    guarantee every notification-creating Celery task relies on: a task
    retried/executed twice for the same event never creates a duplicate.

    Also the single choke point for push delivery: every caller reaches
    this function, so a push is scheduled here -- once, only on genuine
    creation -- rather than at each of the 4+ call sites.
    """
    if related_object is None:
        notification = Notification.objects.create(
            user=user, type=notification_type, title=title, message=message
        )
        created = True
    else:
        related_object_type = related_object.__class__.__name__.lower()
        related_object_id = related_object.pk
        try:
            notification, created = Notification.objects.get_or_create(
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
            created = False

    if created:
        # Local import: apps.notifications.tasks imports this module, so a
        # top-level import here would be circular.
        from apps.notifications.tasks import send_push_notification_task

        transaction.on_commit(lambda: send_push_notification_task.delay(notification.id))

    return notification
