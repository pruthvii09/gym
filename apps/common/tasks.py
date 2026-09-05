from celery import shared_task

from apps.common import email


@shared_task
def send_email_task(*, subject, message, recipient_list):
    email.send_email(subject=subject, message=message, recipient_list=recipient_list)
