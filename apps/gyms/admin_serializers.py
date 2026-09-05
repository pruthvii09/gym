from rest_framework import serializers

from apps.gyms.models import Gym, GymCheckinDevice, GymMembership


class AdminGymSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gym
        fields = (
            "id",
            "name",
            "description",
            "address",
            "city",
            "state",
            "country",
            "postal_code",
            "latitude",
            "longitude",
            "checkin_radius_meters",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class AdminGymMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = GymMembership
        fields = ("id", "user", "gym", "role", "status", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class AdminGymCheckinDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = GymCheckinDevice
        fields = (
            "id",
            "gym",
            "name",
            "device_code",
            "status",
            "last_rotation_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class AdminDeviceStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=GymCheckinDevice.Status.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class AdminGymRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
