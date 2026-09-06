from rest_framework import serializers

from apps.social.models import ActivityItem, ActivityType
from apps.users.public_serializers import UserSearchResultSerializer

# Keyed by ActivityItem.related_object_type (the lowercased model class
# name, same convention as apps.notifications.services.notify), each a
# function of (item, related_object | None) -> str. One place to add a new
# activity type's display text, instead of branching in the serializer body.
_SUMMARY_BUILDERS = {
    ActivityType.CHECKIN: lambda item, obj: (
        f"checked in at {obj.gym.name}" if obj else "checked in"
    ),
    ActivityType.STREAK_MILESTONE: lambda item, obj: f"reached a {item.value}-day streak",
    ActivityType.BADGE_EARNED: lambda item, obj: (
        f"earned the {obj.badge.name} badge" if obj else "earned a badge"
    ),
    ActivityType.WORKOUT_COMPLETED: lambda item, obj: (
        f"completed a {obj.exercises.count()}-exercise workout at {obj.gym.name}"
        if obj
        else "completed a workout"
    ),
}


class ActivityItemSerializer(serializers.ModelSerializer):
    actor = UserSearchResultSerializer(source="user", read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = ActivityItem
        fields = ("id", "type", "actor", "summary", "created_at")
        read_only_fields = fields

    def get_summary(self, obj):
        related_object = self._related_object(obj)
        return _SUMMARY_BUILDERS[obj.type](obj, related_object)

    def _related_object(self, obj):
        if not obj.related_object_id:
            return None
        # Local imports: apps.social sits "above" checkins/badges/workouts
        # in the dependency graph (its tasks already import them at module
        # level), so this is just keeping that traversal next to the one
        # place it's used rather than a circular-import workaround.
        if obj.related_object_type == "checkin":
            from apps.checkins.models import CheckIn

            return CheckIn.objects.select_related("gym").filter(pk=obj.related_object_id).first()
        if obj.related_object_type == "userbadge":
            from apps.badges.models import UserBadge

            return (
                UserBadge.objects.select_related("badge")
                .filter(pk=obj.related_object_id)
                .first()
            )
        if obj.related_object_type == "workoutsession":
            from apps.workouts.models import WorkoutSession

            return (
                WorkoutSession.objects.select_related("gym")
                .filter(pk=obj.related_object_id)
                .first()
            )
        return None
