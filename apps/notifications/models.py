from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class NotificationType(models.TextChoices):
    STREAK_MILESTONE = "streak_milestone", "Streak milestone"
    REWARD_UNLOCKED = "reward_unlocked", "Reward unlocked"
    REWARD_SHIPPED = "reward_shipped", "Reward shipped"
    CHALLENGE = "challenge", "Challenge"
    NEW_FOLLOWER = "new_follower", "New follower"
    SYSTEM = "system", "System"


class Notification(UUIDTimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=32, choices=NotificationType.choices)
    title = models.CharField(max_length=255)
    message = models.TextField()
    read_at = models.DateTimeField(null=True, blank=True)

    # Internal plumbing, excluded from the API serializer: lets a retried
    # task detect "have I already notified for this exact event" via
    # get_or_create, without pulling in contenttypes/GenericForeignKey for
    # a need that's just an equality-based dedupe key, not polymorphic
    # querying. Left blank/null for notifications with no natural single
    # related row (SYSTEM broadcasts, streak milestones).
    related_object_type = models.CharField(max_length=32, blank=True, default="")
    related_object_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "type", "related_object_type", "related_object_id"],
                condition=models.Q(related_object_id__isnull=False),
                name="uniq_notification_per_related_object",
            )
        ]

    def __str__(self):
        return f"{self.type} for {self.user_id}"
