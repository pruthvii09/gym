from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class Follow(UUIDTimeStampedModel):
    """An instant, one-directional follow -- no request/accept step, matching
    apps.users.public_views' platform-wide search/profile visibility: any
    signed-in member can already see any other member's profile, so a follow
    is "subscribe to their activity", not a privacy gate.
    """

    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following_links")
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name="follower_links")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="uniq_follow_pair"),
            models.CheckConstraint(
                check=~models.Q(follower=models.F("following")), name="no_self_follow"
            ),
        ]
        indexes = [
            models.Index(fields=["following"]),
            models.Index(fields=["follower"]),
        ]

    def __str__(self):
        return f"{self.follower_id} -> {self.following_id}"


class ActivityType(models.TextChoices):
    CHECKIN = "checkin", "Check-in"
    STREAK_MILESTONE = "streak_milestone", "Streak milestone"
    BADGE_EARNED = "badge_earned", "Badge earned"
    WORKOUT_COMPLETED = "workout_completed", "Workout completed"


class ActivityItem(UUIDTimeStampedModel):
    """One entry in a user's activity history. Feeds are fan-out-on-read
    (apps.social.services.get_feed filters this table by the caller's
    followed-user ids) rather than fan-out-on-write -- simpler, and fine at
    this scale, same "generic function over the data" preference as
    apps.badges.services.evaluate_badges.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activity_items")
    type = models.CharField(max_length=32, choices=ActivityType.choices)
    # Same dedupe-key shape as apps.notifications.models.Notification -- lets
    # a retried Celery task detect "already recorded this exact event"
    # without GenericForeignKey.
    related_object_type = models.CharField(max_length=32, blank=True, default="")
    related_object_id = models.UUIDField(null=True, blank=True)
    # Only populated for STREAK_MILESTONE (the reached streak length) --
    # every other type derives its display text by following
    # related_object_type/id instead. Needed because UserStreak is a
    # singleton with no per-milestone row to point related_object_id at, so
    # there's nowhere else to read "14" back from later.
    value = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "type", "related_object_type", "related_object_id"],
                condition=models.Q(related_object_id__isnull=False),
                name="uniq_activity_per_related_object",
            )
        ]

    def __str__(self):
        return f"{self.type} for {self.user_id}"
