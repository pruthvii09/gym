from rest_framework import serializers

from apps.streaks.models import StreakPolicy, UserStreak


class AdminUserStreakSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = UserStreak
        fields = (
            "id",
            "user",
            "user_email",
            "current_streak",
            "longest_streak",
            "last_activity_date",
            "updated_at",
        )
        read_only_fields = fields


class AdminStreakPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = StreakPolicy
        fields = (
            "id",
            "minimum_days_per_week",
            "allowed_rest_days",
            "grace_period",
            "freeze_count",
            "updated_at",
        )
        read_only_fields = ("id", "updated_at")
