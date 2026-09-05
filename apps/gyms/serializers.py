from rest_framework import serializers

from apps.gyms import services
from apps.gyms.models import Gym, GymCheckinDevice, GymMembership, GymStaffInvite
from apps.users.models import User


class GymSerializer(serializers.ModelSerializer):
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
        read_only_fields = fields


class GymCreateSerializer(serializers.ModelSerializer):
    """Member-facing self-service gym creation -- see services.create_owned_gym.
    Deliberately omits `status`: the creator never gets to set it -- a
    self-created gym always starts PENDING (create_owned_gym forces this,
    overriding the model's own ACTIVE default) and only a staff user can
    move it to ACTIVE/REJECTED, via the approve/reject endpoints or
    PATCH /admin/gyms/{id}/.
    """

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
        )
        read_only_fields = ("id",)
        extra_kwargs = {
            "description": {"required": False},
            "state": {"required": False},
            "postal_code": {"required": False},
            "checkin_radius_meters": {"required": False},
        }

    def create(self, validated_data):
        user = self.context["request"].user
        return services.create_owned_gym(user=user, **validated_data)


class OwnedGymUpdateSerializer(serializers.ModelSerializer):
    """Gym-owner self-service profile edit -- see services.update_own_gym.
    Deliberately omits `status`, same reasoning as GymCreateSerializer: an
    owner can never move their own gym's approval state.
    """

    class Meta:
        model = Gym
        fields = (
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
        )
        extra_kwargs = {field: {"required": False} for field in fields}

    def update(self, instance, validated_data):
        user = self.context["request"].user
        return services.update_own_gym(actor=user, gym=instance, **validated_data)


class GymMemberUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "email_verified", "phone_verified")
        read_only_fields = fields


class GymMemberSerializer(serializers.ModelSerializer):
    """A gym's own roster, for its staff (GET /gyms/{id}/members/) -- distinct
    from GymMembershipSerializer below, which nests `gym` for the *caller's*
    own memberships, not `user` for a specific gym's members.
    """

    user = GymMemberUserSerializer(read_only=True)

    class Meta:
        model = GymMembership
        fields = ("id", "user", "role", "status", "created_at")
        read_only_fields = fields


class GymMembershipSerializer(serializers.ModelSerializer):
    """Backs GET /api/v1/me/gym-memberships/ -- the member-facing "which
    gyms am I in" list that has no equivalent elsewhere (only the
    is_staff-gated admin API can list memberships otherwise).
    """

    gym = GymSerializer(read_only=True)

    class Meta:
        model = GymMembership
        fields = ("id", "gym", "role", "status", "created_at")
        read_only_fields = fields


class GymCheckinDeviceSerializer(serializers.ModelSerializer):
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


class GymStaffRoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=[(r.value, r.label) for r in GymMembership.STAFF_ROLES]
    )

    def save(self):
        request = self.context["request"]
        return services.update_gym_staff_role(
            actor=request.user,
            gym=self.context["gym"],
            membership=self.context["membership"],
            role=self.validated_data["role"],
        )


class GymStaffInviteCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=[(r.value, r.label) for r in GymMembership.STAFF_ROLES]
    )

    def save(self):
        request = self.context["request"]
        return services.invite_gym_staff(
            actor=request.user,
            gym=self.context["gym"],
            email=self.validated_data["email"],
            role=self.validated_data["role"],
        )


class GymStaffInviteSerializer(serializers.ModelSerializer):
    invited_by_email = serializers.EmailField(source="invited_by.email", read_only=True)

    class Meta:
        model = GymStaffInvite
        fields = (
            "id",
            "email",
            "role",
            "status",
            "invited_by_email",
            "expires_at",
            "created_at",
        )
        read_only_fields = fields


class GymStaffInvitePreviewSerializer(serializers.ModelSerializer):
    """Unauthenticated-safe preview -- see services.preview_gym_staff_invite.
    Deliberately excludes invited_by/id: nothing beyond what the invitee
    needs to see before deciding to log in/register.
    """

    gym = GymSerializer(read_only=True)

    class Meta:
        model = GymStaffInvite
        fields = ("gym", "email", "role", "expires_at")
        read_only_fields = fields


class GymCheckinDeviceCreateSerializer(serializers.Serializer):
    gym = serializers.PrimaryKeyRelatedField(
        queryset=Gym.objects.filter(status=Gym.Status.ACTIVE)
    )
    name = serializers.CharField(max_length=100)

    def create(self, validated_data):
        user = self.context["request"].user
        return services.create_gym_device(user=user, **validated_data)
