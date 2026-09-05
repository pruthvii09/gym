from celery import shared_task
from django.conf import settings

from apps.common import email as email_lib
from apps.users.models import OTP

_OTP_EMAIL_SUBJECTS = {
    OTP.Purpose.EMAIL_VERIFICATION: "Verify your GymStreak email",
    OTP.Purpose.PASSWORD_RESET: "Reset your GymStreak password",
}


@shared_task
def send_otp_email_task(*, purpose, destination, code):
    subject = _OTP_EMAIL_SUBJECTS[purpose]
    message = (
        f"Your code is {code}. It expires in {settings.OTP_EXPIRY_MINUTES} minutes. "
        "If you didn't request this, you can ignore this email."
    )
    email_lib.send_email(subject=subject, message=message, recipient_list=[destination])
    # Deliberately no return value containing the code -- Celery's INFO-level
    # "Task succeeded" log line reprs the return value, so it must never
    # carry anything sensitive.
