from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class UserStreak(UUIDTimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="streak")
    current_streak = models.PositiveIntegerField(default=0)
    longest_streak = models.PositiveIntegerField(default=0)
    last_activity_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.user_id} streak={self.current_streak}"


class StreakPolicy(UUIDTimeStampedModel):
    minimum_days_per_week = models.PositiveSmallIntegerField(default=2)
    allowed_rest_days = models.PositiveSmallIntegerField(default=1)
    # Minutes. Shifts a check-in's attributed calendar day so a late-night
    # workout timestamped a few minutes past UTC midnight isn't unfairly
    # treated as the next day.
    grace_period = models.PositiveIntegerField(default=120)
    freeze_count = models.PositiveSmallIntegerField(default=2)

    class Meta:
        verbose_name_plural = "streak policies"

    def __str__(self):
        return (
            f"min_days_per_week={self.minimum_days_per_week} "
            f"allowed_rest_days={self.allowed_rest_days} "
            f"grace_period={self.grace_period}min freeze_count={self.freeze_count}"
        )
