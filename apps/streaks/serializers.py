from rest_framework import serializers

from apps.streaks.models import UserStreak


class UserStreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserStreak
        fields = ("current_streak", "longest_streak", "last_activity_date", "updated_at")
        read_only_fields = fields


class CalendarQuerySerializer(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)
