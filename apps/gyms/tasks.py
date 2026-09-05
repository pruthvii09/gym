from celery import shared_task
from django.conf import settings

from apps.common import email as email_lib


@shared_task
def send_gym_staff_invite_email_task(*, destination, gym_name, role, token):
    subject = f"You've been invited to join {gym_name} on GymStreak"
    link = f"{settings.FRONTEND_URL}/staff-invites/{token}"
    message = (
        f"You've been invited to join {gym_name} as {role} on GymStreak.\n\n"
        f"Accept your invite: {link}\n\n"
        f"This link expires in {settings.GYM_STAFF_INVITE_EXPIRY_DAYS} days. "
        "If you weren't expecting this, you can ignore this email."
    )
    email_lib.send_email(subject=subject, message=message, recipient_list=[destination])
    # No return value carrying the token -- same reasoning as
    # send_otp_email_task: Celery's INFO log reprs the return value.
