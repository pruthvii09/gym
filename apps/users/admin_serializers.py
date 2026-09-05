from rest_framework import serializers

from apps.users import services
from apps.users.models import User


class AdminUserSerializer(serializers.ModelSerializer):
    gym = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "email_verified",
            "phone_verified",
            "is_active",
            "is_staff",
            "last_login",
            "created_at",
            "updated_at",
            "gym",
        )
        read_only_fields = fields

    def get_gym(self, obj):
        return services.member_gym_summary(obj)


class AdminUserStatusUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class AdminUserBlockRewardClaimsSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
