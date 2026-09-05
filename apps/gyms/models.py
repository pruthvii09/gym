from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class Gym(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        # A self-service-created gym (services.create_owned_gym) starts here
        # and is invisible everywhere member-facing (every public gym read
        # filters strictly on ACTIVE) until a staff user approves/rejects it
        # via services.admin_approve_gym/admin_reject_gym.
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        REJECTED = "rejected", "Rejected"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    # Unused by any logic in this phase -- reserved for a future geofencing
    # check when member check-in redemption is built.
    checkin_radius_meters = models.PositiveIntegerField(default=100)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return self.name


class GymMembership(UUIDTimeStampedModel):
    class Role(models.TextChoices):
        MEMBER = "member", "Member"
        STAFF = "staff", "Staff"
        MANAGER = "manager", "Manager"
        OWNER = "owner", "Owner"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    STAFF_ROLES = (Role.STAFF, Role.MANAGER, Role.OWNER)

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="gym_memberships")
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        unique_together = ("user", "gym")
        indexes = [models.Index(fields=["gym", "role", "status"])]

    def __str__(self):
        return f"{self.user_id} @ {self.gym_id} ({self.role})"


class GymStaffInvite(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name="staff_invites")
    email = models.EmailField()
    role = models.CharField(max_length=16, choices=GymMembership.Role.choices)
    invited_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_gym_staff_invites"
    )
    # Same shape as CheckinSession.token_hash: only the sha256 hash of a
    # secrets.token_urlsafe(32) value is ever persisted; the raw value exists
    # only in the outbound email, never logged, never stored.
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()

    class Meta:
        indexes = [
            models.Index(fields=["gym", "status"]),
            models.Index(fields=["token_hash", "status"]),
        ]

    def __str__(self):
        return f"invite for {self.email} @ {self.gym_id} ({self.role}, {self.status})"


class GymCheckinDevice(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        DISABLED = "disabled", "Disabled"

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name="checkin_devices")
    name = models.CharField(max_length=100)
    device_code = models.CharField(max_length=32, unique=True, editable=False)
    # Hashed, never plaintext. Has no functional role in this phase's request
    # flow -- create/rotate/qr are all staff-JWT-authenticated, not
    # device-authenticated. Forward-compatible infrastructure for a future
    # phase where the physical device might authenticate directly, mirroring
    # how OTP.Purpose.PHONE_VERIFICATION was built with no endpoint yet.
    secret_hash = models.CharField(max_length=128)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    last_rotation_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["gym", "status"])]

    def __str__(self):
        return f"{self.name} ({self.device_code})"


class CheckinSession(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CONSUMED = "consumed", "Consumed"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name="checkin_sessions")
    device = models.ForeignKey(
        GymCheckinDevice, on_delete=models.CASCADE, related_name="checkin_sessions"
    )
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        indexes = [
            models.Index(fields=["token_hash", "status"]),
            models.Index(fields=["device", "status"]),
        ]

    def __str__(self):
        return f"session for {self.device_id} ({self.status})"
