"""Business logic for the users app. Views/serializers stay thin and call
into these functions; nothing here trusts client-provided state beyond what
was already validated by the caller.
"""

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.audit import services as audit_services
from apps.gyms.models import GymMembership
from apps.users import otp
from apps.users.models import OTP, User, UserDevice
from apps.users.tasks import send_otp_email_task

# OTP delivery is async (Celery), a deliberate reversal of an earlier
# sync-only design. Three mitigations make this acceptable despite the
# plaintext code transiting through the Redis broker as a task argument:
#   1. celery_worker runs at -l info. Celery's default succeeded/failure log
#      lines at INFO show task name/id/runtime and (on success) a repr of
#      the RETURN VALUE only -- arguments only surface at DEBUG-level
#      "received" tracing, which this deployment doesn't enable. As long as
#      send_otp_email_task never returns the code (it doesn't), INFO logs
#      stay clean.
#   2. Redis in this docker-compose setup is internal-only, never exposed
#      past the compose network.
#   3. OTP.code_hash remains the only thing ever persisted to a table -- the
#      plaintext still never touches storage, only a transient broker
#      message and the task's stack.


def register_user(*, email, password, first_name="", last_name="", phone=None, gym=None):
    with transaction.atomic():
        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
        )
        if gym is not None:
            GymMembership.objects.create(
                user=user,
                gym=gym,
                role=GymMembership.Role.MEMBER,
                status=GymMembership.Status.ACTIVE,
            )
    return user


def send_email_verification(user):
    if user.email_verified:
        raise ValidationError("Email is already verified.")
    if not otp.check_resend_cooldown(user, OTP.Purpose.EMAIL_VERIFICATION):
        raise ValidationError("Please wait before requesting another code.")

    with transaction.atomic():
        _, code = otp.create_otp(user, OTP.Purpose.EMAIL_VERIFICATION, user.email)
        transaction.on_commit(
            lambda: send_otp_email_task.delay(
                purpose=OTP.Purpose.EMAIL_VERIFICATION, destination=user.email, code=code
            )
        )


def confirm_email_verification(user, code):
    otp.verify_otp(user, OTP.Purpose.EMAIL_VERIFICATION, code)
    user.email_verified = True
    user.save(update_fields=["email_verified"])


def request_password_reset(email):
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        # Enumeration-safe no-op: no OTP, no email, no error -- the caller
        # always returns the same generic response regardless.
        return

    if not otp.check_resend_cooldown(user, OTP.Purpose.PASSWORD_RESET):
        # Still return silently: a distinct error here (vs. the generic
        # always-200 response) would itself leak that this email has an
        # account and a reset was already requested.
        return

    with transaction.atomic():
        _, code = otp.create_otp(user, OTP.Purpose.PASSWORD_RESET, user.email)
        transaction.on_commit(
            lambda: send_otp_email_task.delay(
                purpose=OTP.Purpose.PASSWORD_RESET, destination=user.email, code=code
            )
        )


def confirm_password_reset(email, code, new_password):
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        # Same generic message a bad/expired code would raise -- don't leak
        # account existence via a distinct error.
        raise ValidationError(otp.INVALID_CODE_ERROR)

    otp.verify_otp(user, OTP.Purpose.PASSWORD_RESET, code)
    validate_password(new_password, user=user)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    invalidate_all_sessions(user)


def invalidate_all_sessions(user):
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


def record_device_login(user, *, device_hash, platform=None):
    if not device_hash:
        return None
    device, _ = UserDevice.objects.update_or_create(
        user=user,
        device_hash=device_hash,
        defaults={"platform": platform or UserDevice.Platform.OTHER},
    )
    return device


def member_gym_summary(user):
    """The user's MEMBER-role gym, as {"id", "name"} or None -- shared by
    UserSerializer.get_gym (GET /me/) and AdminUserSerializer.get_gym
    (GET /admin/users/) so the lookup lives in exactly one place.
    """
    membership = (
        user.gym_memberships.filter(
            role=GymMembership.Role.MEMBER, status=GymMembership.Status.ACTIVE
        )
        .select_related("gym")
        .first()
    )
    if membership is None:
        return None
    return {"id": str(membership.gym_id), "name": membership.gym.name}


def update_profile(user, **validated_data):
    if "phone" in validated_data and validated_data["phone"] != user.phone:
        user.phone_verified = False
    for field, value in validated_data.items():
        setattr(user, field, value)
    user.save()
    return user


def set_user_active(*, actor, user, is_active, reason=""):
    """Admin-driven suspend/restore. Flips the same `is_active` flag the
    Django admin form already used -- already fully enforced everywhere
    (simplejwt re-checks it on every request, not just at login) -- this
    just adds an audited, API-reachable path to it.

    Suspending also blacklists every outstanding refresh token, mirroring
    confirm_password_reset's "log out everywhere" behavior: an already
    issued, still-unexpired access token would otherwise keep working for
    up to its own lifetime even after is_active flips.
    """
    if user.is_active == is_active:
        return user

    previous_state = {"is_active": user.is_active}
    user.is_active = is_active
    user.save(update_fields=["is_active"])

    if not is_active:
        invalidate_all_sessions(user)

    audit_services.record(
        actor=actor,
        action="user.suspend" if not is_active else "user.restore",
        entity=user,
        previous_state=previous_state,
        new_state={"is_active": user.is_active},
        reason=reason,
    )
    return user
