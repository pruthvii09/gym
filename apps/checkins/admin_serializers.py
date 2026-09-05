from rest_framework import serializers

from apps.checkins.models import CheckIn


class AdminCheckInSerializer(serializers.ModelSerializer):
    """Unlike the member-facing CheckinSerializer, admins ARE shown
    risk_score -- the "don't hand out a tuning oracle" reasoning only
    applies to the client whose own behavior is being scored.
    """

    user_email = serializers.EmailField(source="user.email", read_only=True)
    gym_name = serializers.CharField(source="gym.name", read_only=True)

    class Meta:
        model = CheckIn
        fields = (
            "id",
            "user",
            "user_email",
            "gym",
            "gym_name",
            "status",
            "verification_method",
            "risk_score",
            "checked_in_at",
            "latitude",
            "longitude",
            "location_accuracy",
            "idempotency_key",
            "created_at",
        )
        read_only_fields = fields


class AdminCheckInResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[CheckIn.Status.VERIFIED, CheckIn.Status.REJECTED])
    reason = serializers.CharField(required=False, allow_blank=True, default="")
