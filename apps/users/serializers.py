from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.gyms.models import Gym
from apps.users import services
from apps.users.models import User, UserDevice


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    # Not required at the API level -- this keeps bootstrap possible when the gym
    # directory is empty (the very first admin/owner has to be able to register before
    # any gym exists). The frontend is what makes this effectively required by disabling
    # submission without a selection whenever the dropdown is non-empty.
    gym_id = serializers.PrimaryKeyRelatedField(
        source="gym",
        queryset=Gym.objects.filter(status=Gym.Status.ACTIVE),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = User
        fields = ("id", "email", "username", "password", "first_name", "last_name", "phone", "gym_id")
        read_only_fields = ("id",)
        extra_kwargs = {"phone": {"required": False, "allow_null": True}}

    def create(self, validated_data):
        return services.register_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    gym = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "phone",
            "email_verified",
            "phone_verified",
            "is_staff",
            "created_at",
            "gym",
        )
        read_only_fields = fields

    def get_gym(self, obj):
        return services.member_gym_summary(obj)


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("username", "first_name", "last_name", "phone")
        extra_kwargs = {
            "username": {"required": False},
            "first_name": {"required": False},
            "last_name": {"required": False},
            "phone": {"required": False, "allow_null": True},
        }

    def update(self, instance, validated_data):
        return services.update_profile(instance, **validated_data)


class LoginSerializer(TokenObtainPairSerializer):
    device_hash = serializers.CharField(required=False, allow_blank=True, max_length=255)
    platform = serializers.ChoiceField(choices=UserDevice.Platform.choices, required=False)

    def validate(self, attrs):
        data = super().validate(attrs)
        services.record_device_login(
            self.user,
            device_hash=attrs.get("device_hash"),
            platform=attrs.get("platform"),
        )
        return data


class VerifyEmailSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)

    def validate(self, attrs):
        services.confirm_email_verification(self.context["request"].user, attrs["code"])
        return attrs


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        services.confirm_password_reset(
            attrs["email"], attrs["code"], attrs["new_password"]
        )
        return attrs
