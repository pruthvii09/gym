import resend
from django.conf import settings
from django.core.mail import send_mail


def send_email(*, subject, message, recipient_list):
    """The one place any outbound email in the system calls out to a
    provider. Provider-agnostic swap point: if this project ever moves off
    Resend, only this function changes.
    """
    if settings.DEBUG or settings.TESTING:
        # Routes through Django's own mail backend rather than a raw print:
        # in DEBUG that's the console backend (settings.EMAIL_BACKEND) --
        # same visible dev behavior as before -- and under TESTING, Django's
        # test runner unconditionally forces the locmem backend, which is
        # what actually populates django.core.mail.outbox for tests that
        # assert on it. Never reaches Resend either way.
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
        )
        return

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send(
        {
            "from": settings.DEFAULT_FROM_EMAIL,
            "to": recipient_list,
            "subject": subject,
            "text": message,
        }
    )
