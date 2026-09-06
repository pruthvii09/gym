from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class Badge(UUIDTimeStampedModel):
    """A badge definition -- data, not code: an admin can add badge #8 later
    as a new row (Django admin, fully editable) with no deploy, as long as
    its `metric` is one already understood by
    apps.badges.services.evaluate_badges. Mirrors
    apps.rewards.models.RewardDefinition.required_streak's "the threshold is
    data, the evaluation is one generic function" shape.
    """

    class Tier(models.TextChoices):
        BRONZE = "bronze", "Bronze"
        SILVER = "silver", "Silver"
        GOLD = "gold", "Gold"
        PLATINUM = "platinum", "Platinum"

    class Metric(models.TextChoices):
        CURRENT_STREAK = "current_streak", "Current streak"
        LONGEST_STREAK = "longest_streak", "Longest streak"
        TOTAL_CHECKINS = "total_checkins", "Total check-ins"
        TOTAL_WORKOUTS = "total_workouts", "Workouts logged"
        TOTAL_SETS = "total_sets", "Sets logged"
        REWARDS_EARNED = "rewards_earned", "Rewards earned"

    key = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255)
    # A lucide-react icon name (e.g. "Flame") -- the frontend looks this up
    # in a small ICON_MAP with a fallback, same "trusted admin-entered
    # string, not free-form user input" reasoning as nowhere else needing
    # sanitization in this codebase.
    icon = models.CharField(max_length=50, default="Award")
    tier = models.CharField(max_length=16, choices=Tier.choices, default=Tier.BRONZE)
    metric = models.CharField(max_length=32, choices=Metric.choices)
    threshold = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["threshold"]
        indexes = [models.Index(fields=["is_active", "metric"])]

    def __str__(self):
        return f"{self.name} ({self.metric} >= {self.threshold})"


class UserBadge(UUIDTimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="badges")
    badge = models.ForeignKey(Badge, on_delete=models.PROTECT, related_name="user_badges")
    earned_at = models.DateTimeField(auto_now_add=True)
    # Capped at 2 by apps.badges.services.set_featured, not a DB constraint --
    # same "validated in the service, not the schema" choice as
    # UserRestDay.self_service_changes_used's lifetime cap.
    is_featured = models.BooleanField(default=False)

    class Meta:
        unique_together = ("user", "badge")
        indexes = [models.Index(fields=["user", "is_featured"])]

    def __str__(self):
        return f"{self.user_id} earned {self.badge_id}"
