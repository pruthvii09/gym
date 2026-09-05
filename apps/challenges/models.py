from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.rewards.models import RewardDefinition


class Challenge(UUIDTimeStampedModel):
    """A time-boxed program on top of the base streak/reward system --
    e.g. a limited-time event with its own bonus reward. Admin-managed only
    in this phase, same as Product/RewardDefinition: no member-facing write
    path, no automatic evaluation logic yet (that's the natural next step,
    mirroring apps.rewards.services.evaluate_rewards).
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    # Optional: a challenge can grant a bonus reward tier on top of the
    # normal streak-milestone rewards. Nullable since not every challenge
    # need be reward-bearing (e.g. a purely informational event).
    reward_definition = models.ForeignKey(
        RewardDefinition,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="challenges",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)

    class Meta:
        indexes = [models.Index(fields=["status", "start_date"])]

    def __str__(self):
        return f"{self.name} ({self.status})"
