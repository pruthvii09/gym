"""Low-level OTP primitives: generate, create, verify, resend-cooldown.

Codes are never stored in plaintext -- only their password-hash. Attempt
limits, expiry, and single-use consumption are enforced here; purpose-specific
side effects (marking an email verified, allowing a password reset) live in
apps.users.services, which calls into this module.
"""

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.users.models import OTP

INVALID_CODE_ERROR = "Invalid or expired code."
TOO_MANY_ATTEMPTS_ERROR = "Too many attempts. Request a new code."


def generate_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))


def create_otp(user, purpose: str, destination: str) -> tuple[OTP, str]:
    code = generate_code()
    otp = OTP.objects.create(
        user=user,
        purpose=purpose,
        destination=destination,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES),
    )
    return otp, code


def verify_otp(user, purpose: str, code: str) -> OTP:
    otp = (
        OTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if otp is None or otp.expires_at < timezone.now():
        raise ValidationError(INVALID_CODE_ERROR)

    otp.attempts += 1

    if otp.attempts > settings.OTP_MAX_ATTEMPTS:
        otp.consumed_at = timezone.now()
        otp.save(update_fields=["attempts", "consumed_at"])
        raise ValidationError(TOO_MANY_ATTEMPTS_ERROR)

    if not check_password(code, otp.code_hash):
        otp.save(update_fields=["attempts"])
        raise ValidationError(INVALID_CODE_ERROR)

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["attempts", "consumed_at"])
    return otp


def check_resend_cooldown(user, purpose: str) -> bool:
    key = f"otp:cooldown:{purpose}:{user.id}"
    return cache.add(key, True, timeout=settings.OTP_RESEND_COOLDOWN_SECONDS)
