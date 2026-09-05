from rest_framework import serializers

from apps.fraud.models import FraudEvent, FraudReview


class AdminFraudEventSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = FraudEvent
        fields = ("id", "user", "user_email", "checkin", "review", "event_type", "details", "created_at")
        read_only_fields = fields


class AdminFraudReviewSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    resolved_by_email = serializers.EmailField(
        source="resolved_by.email", read_only=True, default=None
    )

    class Meta:
        model = FraudReview
        fields = (
            "id",
            "user",
            "user_email",
            "risk_level",
            "status",
            "reason",
            "resolved_at",
            "resolved_by",
            "resolved_by_email",
            "resolution_notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class AdminFraudReviewResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[FraudReview.Status.APPROVED, FraudReview.Status.REJECTED])
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default="")
