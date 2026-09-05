"""Business logic for the gyms app, including authorization -- gym-staff
checks live here rather than in a custom DRF permission class, matching how
apps/users keeps authorization/business rules in services.py.
"""

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.db import transaction
from django.forms.models import model_to_dict
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.audit import services as audit_services
from apps.gyms import tokens
from apps.gyms.models import (
    CheckinSession,
    Gym,
    GymCheckinDevice,
    GymMembership,
    GymStaffInvite,
)
from apps.gyms.tasks import send_gym_staff_invite_email_task
from apps.users.models import User

INVALID_TOKEN_ERROR = "Invalid check-in code."
ALREADY_USED_ERROR = "Check-in code has already been used or is no longer valid."


def assert_gym_role(user, gym, allowed_roles):
    has_role = GymMembership.objects.filter(
        user=user,
        gym=gym,
        status=GymMembership.Status.ACTIVE,
        role__in=allowed_roles,
    ).exists()
    if not has_role:
        raise PermissionDenied("You do not have staff access to this gym.")


def assert_gym_staff(user, gym):
    assert_gym_role(user, gym, GymMembership.STAFF_ROLES)


def assert_can_manage_role(actor_role, target_role):
    """Encodes the gym-staff permission matrix: OWNER can add/remove/change
    anyone (including other owners/managers); MANAGER can only touch STAFF-
    tier people; STAFF can never manage anyone.
    """
    if actor_role == GymMembership.Role.OWNER:
        return
    if actor_role == GymMembership.Role.MANAGER and target_role == GymMembership.Role.STAFF:
        return
    raise PermissionDenied(
        "You do not have permission to manage a staff member with that role."
    )


def _generate_device_code() -> str:
    while True:
        code = f"dev_{secrets.token_hex(8)}"
        if not GymCheckinDevice.objects.filter(device_code=code).exists():
            return code


def create_gym_device(*, user, gym, name):
    assert_gym_staff(user, gym)
    plaintext_secret = secrets.token_urlsafe(32)
    device = GymCheckinDevice.objects.create(
        gym=gym,
        name=name,
        device_code=_generate_device_code(),
        secret_hash=make_password(plaintext_secret),
        status=GymCheckinDevice.Status.ACTIVE,
        last_rotation_at=timezone.now(),
    )
    return device, plaintext_secret


def rotate_gym_device(*, user, device):
    assert_gym_staff(user, device.gym)
    plaintext_secret = secrets.token_urlsafe(32)
    device.secret_hash = make_password(plaintext_secret)
    device.last_rotation_at = timezone.now()
    device.save(update_fields=["secret_hash", "last_rotation_at", "updated_at"])

    # Rotation invalidates outstanding QR sessions. This is a plain DB
    # update, not cryptographic salt-rotation: the secret is one-way-hashed
    # and never used as a live signing key (the signer's key is the global
    # SECRET_KEY), so there's nothing to re-derive -- revoking outstanding
    # rows is the correct and sufficient mechanism.
    CheckinSession.objects.filter(
        device=device, status=CheckinSession.Status.ACTIVE
    ).update(status=CheckinSession.Status.REVOKED)

    return device, plaintext_secret


def mint_checkin_qr(*, user, device):
    assert_gym_staff(user, device.gym)
    if device.status != GymCheckinDevice.Status.ACTIVE:
        raise ValidationError("This check-in device is disabled.")

    signed_payload, token_hash = tokens.generate_signed_token()
    session = CheckinSession.objects.create(
        gym=device.gym,
        device=device,
        token_hash=token_hash,
        expires_at=timezone.now() + timedelta(seconds=settings.CHECKIN_QR_TTL_SECONDS),
        status=CheckinSession.Status.ACTIVE,
    )
    return session, signed_payload


def redeem_checkin_token(raw_signed_token: str) -> CheckinSession:
    """Validate and single-use-consume a scanned QR token.

    Internal-infrastructure-only in this phase: no HTTP endpoint calls this
    yet. A future apps.checkins endpoint will call this and then record the
    actual check-in event / streak side effects.
    """
    try:
        raw_value = tokens.unsign_token(raw_signed_token)
    except signing.BadSignature:
        raise ValidationError(INVALID_TOKEN_ERROR)

    token_hash = tokens.hash_raw_value(raw_value)
    session = (
        CheckinSession.objects.select_related("device", "gym")
        .filter(token_hash=token_hash)
        .first()
    )
    if session is None:
        raise ValidationError(INVALID_TOKEN_ERROR)
    if session.device.status != GymCheckinDevice.Status.ACTIVE:
        raise ValidationError("This check-in device is disabled.")
    if session.expires_at <= timezone.now():
        raise ValidationError("Check-in code has expired.")
    if session.status != CheckinSession.Status.ACTIVE:
        raise ValidationError(ALREADY_USED_ERROR)

    # Atomic single-use transition: closes the race window where the same
    # token is redeemed twice concurrently between the read above and here.
    updated = CheckinSession.objects.filter(
        pk=session.pk, status=CheckinSession.Status.ACTIVE
    ).update(status=CheckinSession.Status.CONSUMED)
    if updated == 0:
        raise ValidationError(ALREADY_USED_ERROR)

    session.status = CheckinSession.Status.CONSUMED
    return session


def create_owned_gym(*, user, **fields):
    """Member-facing self-service gym creation: any authenticated user can
    create a gym and becomes its OWNER, atomically. Distinct from
    admin_create_gym below -- that one is platform-staff-only and doesn't
    grant the actor any membership; this one always does.

    Starts PENDING, not ACTIVE -- every public-facing gym read (GymListView,
    GymDetailView, the register gym-picker) filters strictly on
    status=ACTIVE, so a newly self-service-created gym is automatically
    invisible everywhere member-facing until a staff user reviews it via
    admin_approve_gym/admin_reject_gym below.
    """
    with transaction.atomic():
        gym = Gym.objects.create(**fields, status=Gym.Status.PENDING)
        GymMembership.objects.create(
            user=user, gym=gym, role=GymMembership.Role.OWNER, status=GymMembership.Status.ACTIVE
        )
    audit_services.record(
        actor=user, action="gym.create_self_service", entity=gym, new_state=model_to_dict(gym)
    )
    return gym


def update_own_gym(*, actor, gym, **fields):
    """Owner self-service profile edit -- distinct from admin_update_gym
    below, which is platform-staff-only. `fields` never includes `status`
    (OwnedGymUpdateSerializer omits it) -- approval stays admin-only.
    """
    assert_gym_role(actor, gym, [GymMembership.Role.OWNER])

    previous_state = model_to_dict(gym)
    for field, value in fields.items():
        setattr(gym, field, value)
    gym.save()
    audit_services.record(
        actor=actor,
        action="gym.self_update",
        entity=gym,
        previous_state=previous_state,
        new_state=model_to_dict(gym),
    )
    return gym


def list_gym_members(*, actor, gym):
    assert_gym_staff(actor, gym)
    return (
        GymMembership.objects.filter(
            gym=gym, role=GymMembership.Role.MEMBER, status=GymMembership.Status.ACTIVE
        )
        .select_related("user")
        .order_by("-created_at")
    )


def list_gym_devices(*, actor, gym):
    assert_gym_staff(actor, gym)
    return GymCheckinDevice.objects.filter(gym=gym).order_by("-created_at")


def list_gym_staff(*, actor, gym):
    assert_gym_staff(actor, gym)
    return (
        GymMembership.objects.filter(
            gym=gym, role__in=GymMembership.STAFF_ROLES, status=GymMembership.Status.ACTIVE
        )
        .select_related("user")
        .order_by("role", "-created_at")
    )


def remove_gym_member(*, actor, gym, membership):
    """Revoke a plain member's home-gym membership. Gated to OWNER/MANAGER --
    a step above the STAFF-tier view-only access to the roster, same
    reasoning as why front-desk STAFF can't manage other staff.
    """
    assert_gym_role(actor, gym, (GymMembership.Role.OWNER, GymMembership.Role.MANAGER))
    previous_state = {"status": membership.status}
    membership.status = GymMembership.Status.INACTIVE
    membership.save(update_fields=["status", "updated_at"])
    audit_services.record(
        actor=actor,
        action="gym_membership.remove_member",
        entity=membership,
        previous_state=previous_state,
        new_state={"status": membership.status},
    )
    return membership


def _actor_role(actor, gym):
    membership = GymMembership.objects.filter(
        user=actor, gym=gym, status=GymMembership.Status.ACTIVE
    ).first()
    return membership.role if membership else None


def update_gym_staff_role(*, actor, gym, membership, role):
    """Change an existing staff member's role. assert_can_manage_role is
    checked against BOTH the membership's current role and the target role
    -- a MANAGER can't use this to promote a STAFF member into a MANAGER,
    nor demote a MANAGER they otherwise couldn't touch.
    """
    actor_role = _actor_role(actor, gym)
    assert_can_manage_role(actor_role, membership.role)
    assert_can_manage_role(actor_role, role)

    if membership.role == GymMembership.Role.OWNER and role != GymMembership.Role.OWNER:
        _assert_not_last_owner(gym, membership)

    previous_state = {"role": membership.role}
    membership.role = role
    membership.save(update_fields=["role", "updated_at"])
    audit_services.record(
        actor=actor,
        action="gym_membership.role_change",
        entity=membership,
        previous_state=previous_state,
        new_state={"role": membership.role},
    )
    return membership


def remove_gym_staff(*, actor, gym, membership):
    actor_role = _actor_role(actor, gym)
    assert_can_manage_role(actor_role, membership.role)
    if membership.role == GymMembership.Role.OWNER:
        _assert_not_last_owner(gym, membership)

    previous_state = {"status": membership.status}
    membership.status = GymMembership.Status.INACTIVE
    membership.save(update_fields=["status", "updated_at"])
    audit_services.record(
        actor=actor,
        action="gym_membership.remove",
        entity=membership,
        previous_state=previous_state,
        new_state={"status": membership.status},
    )
    return membership


def _assert_not_last_owner(gym, excluding_membership):
    remaining_owners = (
        GymMembership.objects.filter(
            gym=gym, role=GymMembership.Role.OWNER, status=GymMembership.Status.ACTIVE
        )
        .exclude(pk=excluding_membership.pk)
        .exists()
    )
    if not remaining_owners:
        raise ValidationError("A gym must always have at least one owner.")


def _generate_invite_token() -> tuple[str, str]:
    raw_value = secrets.token_urlsafe(32)
    return raw_value, tokens.hash_raw_value(raw_value)


def invite_gym_staff(*, actor, gym, email, role):
    if role not in GymMembership.STAFF_ROLES:
        raise ValidationError("role must be staff, manager, or owner.")
    actor_role = _actor_role(actor, gym)
    assert_can_manage_role(actor_role, role)

    raw_token, token_hash = _generate_invite_token()
    invite = GymStaffInvite.objects.create(
        gym=gym,
        email=email.lower(),
        role=role,
        invited_by=actor,
        token_hash=token_hash,
        expires_at=timezone.now() + timedelta(days=settings.GYM_STAFF_INVITE_EXPIRY_DAYS),
    )
    transaction.on_commit(
        lambda: send_gym_staff_invite_email_task.delay(
            destination=invite.email,
            gym_name=gym.name,
            role=invite.role,
            token=raw_token,
        )
    )
    audit_services.record(
        actor=actor,
        action="gym_staff_invite.create",
        entity=invite,
        new_state={"email": invite.email, "role": invite.role},
    )
    return invite


def list_gym_staff_invites(*, actor, gym):
    assert_gym_staff(actor, gym)
    return GymStaffInvite.objects.filter(gym=gym).order_by("-created_at")


def revoke_gym_staff_invite(*, actor, gym, invite):
    actor_role = _actor_role(actor, gym)
    assert_can_manage_role(actor_role, invite.role)

    if invite.status != GymStaffInvite.Status.PENDING:
        raise ValidationError("Only a pending invite can be revoked.")

    invite.status = GymStaffInvite.Status.REVOKED
    invite.save(update_fields=["status", "updated_at"])
    audit_services.record(
        actor=actor,
        action="gym_staff_invite.revoke",
        entity=invite,
        new_state={"status": invite.status},
    )
    return invite


INVALID_INVITE_ERROR = "This invite link is invalid or has expired."


def _resolve_pending_invite(raw_token):
    token_hash = tokens.hash_raw_value(raw_token)
    invite = GymStaffInvite.objects.select_related("gym").filter(token_hash=token_hash).first()
    if invite is None:
        raise NotFound(INVALID_INVITE_ERROR)
    if invite.status != GymStaffInvite.Status.PENDING or invite.expires_at <= timezone.now():
        raise ValidationError(INVALID_INVITE_ERROR)
    return invite


def preview_gym_staff_invite(raw_token):
    """Unauthenticated lookup -- the token itself is the bearer credential,
    same trust model as the checkin QR token. Powers an "you're invited to
    join X as Y" page before the visitor has necessarily logged in.
    """
    return _resolve_pending_invite(raw_token)


def accept_gym_staff_invite(*, user, raw_token):
    invite = _resolve_pending_invite(raw_token)
    if invite.email.lower() != user.email.lower():
        # The real security boundary: knowing the token alone isn't enough
        # to accept as someone else -- the logged-in user's own email must
        # match who was actually invited.
        raise PermissionDenied("This invite was sent to a different email address.")

    with transaction.atomic():
        membership, _ = GymMembership.objects.update_or_create(
            user=user,
            gym=invite.gym,
            defaults={"role": invite.role, "status": GymMembership.Status.ACTIVE},
        )
        invite.status = GymStaffInvite.Status.ACCEPTED
        invite.save(update_fields=["status", "updated_at"])

    audit_services.record(
        actor=user,
        action="gym_staff_invite.accept",
        entity=invite,
        new_state={"role": invite.role},
    )
    return membership


# --- Admin/operations -------------------------------------------------------
# Platform setup (gyms, staff, device lifecycle) is admin-only per the README
# -- these functions are the audited, API-reachable equivalent of what was
# previously Django-admin-only.


def admin_create_gym(*, actor, **fields):
    gym = Gym.objects.create(**fields)
    audit_services.record(
        actor=actor, action="gym.create", entity=gym, new_state=model_to_dict(gym)
    )
    return gym


def admin_update_gym(*, actor, gym, **fields):
    previous_state = model_to_dict(gym)
    for field, value in fields.items():
        setattr(gym, field, value)
    gym.save()
    audit_services.record(
        actor=actor,
        action="gym.update",
        entity=gym,
        previous_state=previous_state,
        new_state=model_to_dict(gym),
    )
    return gym


def admin_assign_membership(*, actor, user, gym, role, status=GymMembership.Status.ACTIVE):
    membership, created = GymMembership.objects.update_or_create(
        user=user, gym=gym, defaults={"role": role, "status": status}
    )
    audit_services.record(
        actor=actor,
        action="gym_membership.create" if created else "gym_membership.update",
        entity=membership,
        new_state={"role": membership.role, "status": membership.status},
    )
    return membership


def admin_approve_gym(*, actor, gym):
    """Approve a self-service-created gym, making it visible/joinable
    everywhere member-facing. Only allowed from PENDING -- mirrors
    apps.rewards.services.transition_claim_status's "only allows specific
    from->to transitions, rejects anything else" discipline.
    """
    if gym.status != Gym.Status.PENDING:
        raise ValidationError("Only pending gyms can be approved.")

    previous_state = {"status": gym.status}
    gym.status = Gym.Status.ACTIVE
    gym.save(update_fields=["status", "updated_at"])
    audit_services.record(
        actor=actor,
        action="gym.approve",
        entity=gym,
        previous_state=previous_state,
        new_state={"status": gym.status},
    )
    return gym


def admin_reject_gym(*, actor, gym, reason=""):
    """Reject a self-service-created gym. Only allowed from PENDING -- see
    admin_approve_gym above. The reason is recorded on the audit log entry
    only (no dedicated model field yet); there's no owner-facing surface
    that would show it in this phase.
    """
    if gym.status != Gym.Status.PENDING:
        raise ValidationError("Only pending gyms can be rejected.")

    previous_state = {"status": gym.status}
    gym.status = Gym.Status.REJECTED
    gym.save(update_fields=["status", "updated_at"])
    audit_services.record(
        actor=actor,
        action="gym.reject",
        entity=gym,
        previous_state=previous_state,
        new_state={"status": gym.status},
        reason=reason,
    )
    return gym


def admin_set_device_status(*, actor, device, status, reason=""):
    """Admin-triggered device enable/disable -- e.g. as a response to a
    compromised kiosk. Disabling also revokes every outstanding QR session
    for the device, same as rotate_gym_device's rotation-invalidation, since
    a disabled device's currently-displayed QR must stop working immediately
    rather than merely reject at redemption time.
    """
    if device.status == status:
        return device

    previous_state = {"status": device.status}
    device.status = status
    device.save(update_fields=["status", "updated_at"])

    if status == GymCheckinDevice.Status.DISABLED:
        CheckinSession.objects.filter(
            device=device, status=CheckinSession.Status.ACTIVE
        ).update(status=CheckinSession.Status.REVOKED)

    audit_services.record(
        actor=actor,
        action="gym_device.status_change",
        entity=device,
        previous_state=previous_state,
        new_state={"status": device.status},
        reason=reason,
    )
    return device
