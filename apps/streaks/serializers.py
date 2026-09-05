from rest_framework import serializers

from apps.streaks import services
from apps.streaks.models import UserRestDay, UserStreak


class UserStreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserStreak
        fields = ("current_streak", "longest_streak", "last_activity_date", "updated_at")
        read_only_fields = fields


class CalendarQuerySerializer(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)


class UserRestDaySerializer(serializers.ModelSerializer):
    self_service_changes_remaining = serializers.SerializerMethodField()

    class Meta:
        model = UserRestDay
        fields = (
            "day_of_week",
            "self_service_changes_used",
            "self_service_changes_remaining",
            "updated_at",
        )
        read_only_fields = fields

    def get_self_service_changes_remaining(self, obj):
        return max(services.REST_DAY_SELF_SERVICE_LIMIT - obj.self_service_changes_used, 0)


class SetRestDaySerializer(serializers.Serializer):
    day_of_week = serializers.IntegerField(min_value=0, max_value=6, allow_null=True)
