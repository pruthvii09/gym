import logging

from celery import shared_task

from apps.checkins.models import CheckIn

logger = logging.getLogger("gymstreak")


@shared_task
def record_checkin_analytics(checkin_id):
    """Demonstrative only -- not a real analytics pipeline/warehouse. Proves
    the async wiring pattern is in place for whenever real analytics
    infrastructure is built.
    """
    try:
        checkin = CheckIn.objects.select_related("gym").get(pk=checkin_id)
    except CheckIn.DoesNotExist:
        return
    logger.info(
        "checkin_analytics status=%s gym_id=%s verification_method=%s",
        checkin.status,
        checkin.gym_id,
        checkin.verification_method,
    )
