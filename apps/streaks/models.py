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


class UserRestDay(UUIDTimeStampedModel):
    """A user's single self-designated weekly rest day (e.g. every Sunday)
    -- a gap on this specific weekday never breaks their streak, additive to
    (not a replacement for) StreakPolicy's generic allowed_rest_days/
    freeze_count budget. One per user, not per gym-membership -- matches
    UserStreak's own platform-wide granularity. Opt-in: day_of_week is None
    until the user (or their gym's staff) sets one.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="rest_day")
    # 0=Monday..6=Sunday, matching Python's date.weekday() -- calculator.py
    # compares this directly against gym_days (date objects), no conversion.
    day_of_week = models.PositiveSmallIntegerField(null=True, blank=True)
    # Self-service changes only (apps.streaks.services.set_rest_day) -- a
    # gym-staff override resets this back to 0 rather than incrementing it,
    # so staff intervention gives the member a fresh allowance.
    self_service_changes_used = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return f"{self.user_id} rest_day={self.day_of_week}"


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
