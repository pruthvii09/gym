from celery import shared_task

from apps.fraud import services as fraud_services
from apps.users.models import User


@shared_task
def assess_and_flag_task(user_id):
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return
    fraud_services.assess_and_flag(user)
