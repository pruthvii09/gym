from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class FraudReview(UUIDTimeStampedModel):
    class RiskLevel(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    class Status(models.TextChoices):
        # APPROVED = the flagged fraud concern is confirmed/valid.
        # REJECTED = the flagged concern is dismissed as a false positive.
        # A review's subject is the CLAIM of fraud, not a referendum on the
        # user -- keeps these two values unambiguous.
        OPEN = "open", "Open"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="fraud_reviews")
    risk_level = models.CharField(max_length=8, choices=RiskLevel.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    reason = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="fraud_reviews_resolved",
    )
    resolution_notes = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        return f"{self.risk_level} review for {self.user_id} ({self.status})"


class FraudEvent(UUIDTimeStampedModel):
    class EventType(models.TextChoices):
        QR_REUSE = "qr_reuse", "QR reuse"
        GPS_MISMATCH = "gps_mismatch", "GPS mismatch"
        TOO_MANY_CHECKINS = "too_many_checkins", "Too many check-ins"
        IMPOSSIBLE_TRAVEL = "impossible_travel", "Impossible travel"
        MULTIPLE_ACCOUNTS_DEVICE = "multiple_accounts_device", "Multiple accounts on device"
        SUSPICIOUS_PATTERN = "suspicious_pattern", "Suspicious pattern"
        DEVICE_ANOMALY = "device_anomaly", "Device anomaly"
        SUSPICIOUS_ACCOUNT_CREATION = "suspicious_account_creation", "Suspicious account creation"
        SUSPICIOUS_REWARD_CLAIM = "suspicious_reward_claim", "Suspicious reward claim"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="fraud_events")
    # Lazy string reference avoids apps.fraud.models needing to import
    # apps.checkins.models directly.
    checkin = models.ForeignKey(
        "checkins.CheckIn",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="fraud_events",
    )
    review = models.ForeignKey(
        FraudReview,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="events",
    )
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    details = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "event_type", "created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} for {self.user_id}"
