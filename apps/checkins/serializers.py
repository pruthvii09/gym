from rest_framework import serializers

from apps.checkins.models import CheckIn
from apps.gyms.models import Gym
from apps.users.models import UserDevice


class CheckinCreateSerializer(serializers.Serializer):
    gym_id = serializers.PrimaryKeyRelatedField(
        source="gym", queryset=Gym.objects.filter(status=Gym.Status.ACTIVE)
    )
    qr_token = serializers.CharField()
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    location_accuracy = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    device_hash = serializers.CharField(required=False, allow_blank=True, max_length=255)
    platform = serializers.ChoiceField(choices=UserDevice.Platform.choices, required=False)


class CheckinSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheckIn
        # Deliberately excludes risk_score and any fraud-event data: exposing
        # the numeric score would hand an attacker a tuning oracle for
        # iteratively discovering what changes it.
        fields = ("id", "gym", "status", "verification_method", "checked_in_at", "created_at")
        read_only_fields = fields
