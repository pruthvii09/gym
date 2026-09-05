from django.db import models
from django.utils import timezone

from apps.common.models import UUIDTimeStampedModel
from apps.gyms.models import CheckinSession, Gym
from apps.users.models import User, UserDevice


class CheckIn(UUIDTimeStampedModel):
    class VerificationMethod(models.TextChoices):
        QR = "qr", "QR"
        GPS = "gps", "GPS"
        MANUAL = "manual", "Manual"
        ADMIN = "admin", "Admin"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"
        REVIEW = "review", "Review"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="checkins")
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name="checkins")
    # Nullable + SET_NULL: this row is a security audit record and must
    # outlive its session reference. Null only when QR resolution failed
    # before any session was matched (bad signature / unknown token).
    session = models.ForeignKey(
        CheckinSession, null=True, blank=True, on_delete=models.SET_NULL, related_name="checkins"
    )
    # Semantically "the moment of the check-in event", distinct from
    # created_at ("when this row was inserted") -- they coincide for this
    # phase's synchronous QR flow but diverge once MANUAL/ADMIN verification
    # methods let staff backdate an entry. Not auto_now_add.
    checked_in_at = models.DateTimeField(default=timezone.now)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_accuracy = models.PositiveIntegerField(null=True, blank=True)
    # The MEMBER's own phone (apps.users.UserDevice), NOT the gym's kiosk
    # (apps.gyms.GymCheckinDevice, referenced only via session.device).
    device = models.ForeignKey(
        UserDevice, null=True, blank=True, on_delete=models.SET_NULL, related_name="checkins"
    )
    verification_method = models.CharField(
        max_length=16, choices=VerificationMethod.choices, default=VerificationMethod.QR
    )
    risk_score = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    # Not in the literal spec'd field list, but required by the explicit
    # idempotency requirement. Uniqueness enforced only when supplied.
    idempotency_key = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "idempotency_key"],
                condition=models.Q(idempotency_key__isnull=False),
                name="checkins_checkin_unique_user_idempotency_key",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "gym", "checked_in_at"], name="checkins_user_gym_ci_idx"),
            models.Index(fields=["user", "status", "created_at"], name="checkins_user_status_cr_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} @ {self.gym_id} ({self.status})"
