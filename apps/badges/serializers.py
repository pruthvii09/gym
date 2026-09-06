from rest_framework import serializers

from apps.badges.models import Badge, UserBadge


class BadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Badge
        fields = ("id", "key", "name", "description", "icon", "tier", "metric", "threshold")
        read_only_fields = fields


class UserBadgeSerializer(serializers.ModelSerializer):
    badge = BadgeSerializer(read_only=True)

    class Meta:
        model = UserBadge
        fields = ("id", "badge", "earned_at", "is_featured")
        read_only_fields = fields


class BadgeProgressSerializer(serializers.Serializer):
    """Wraps apps.badges.services.badge_progress's plain dicts -- powers the
    profile's badge gallery, unlocked and locked (with a progress bar)
    alike.
    """

    badge = BadgeSerializer()
    user_badge = UserBadgeSerializer(allow_null=True)
    current_value = serializers.IntegerField()


class SetFeaturedBadgesSerializer(serializers.Serializer):
    badge_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)
