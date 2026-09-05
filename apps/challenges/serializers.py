from rest_framework import serializers

from apps.challenges.models import Challenge


class AdminChallengeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Challenge
        fields = (
            "id",
            "name",
            "description",
            "start_date",
            "end_date",
            "reward_definition",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
