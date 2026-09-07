from django.conf import settings
from django.utils import timezone
from pywebpush import WebPushException, webpush


def send_web_push(*, subscription, payload) -> bool:
    """The one place any outbound push notification calls out to a
    provider (Web Push/VAPID). Provider-agnostic swap point, same role as
    apps.common.email.send_email. Returns whether the push was accepted by
    the push service -- never raises, since a failed push is a best-effort
    side channel, not something a caller should have to handle.
    """
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh_key, "auth": subscription.auth_key},
            },
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"},
        )
        return True
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code in (404, 410):
            # The push service no longer recognizes this subscription
            # (browser unsubscribed, permission revoked, endpoint expired)
            # -- standard Web Push semantics for "stop sending to this one".
            subscription.disabled_at = timezone.now()
            subscription.save(update_fields=["disabled_at", "updated_at"])
        return False
