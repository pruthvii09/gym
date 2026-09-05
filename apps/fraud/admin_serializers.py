from rest_framework import serializers

from apps.fraud.models import FraudEvent, FraudReview


class AdminFraudEventSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    # Inline context instead of a bare id -- there's no admin check-ins page
    # yet to deep-link to, so the event log shows what it needs directly.
    checkin_gym_name = serializers.CharField(
        source="checkin.gym.name", read_only=True, default=None
    )
    checkin_checked_in_at = serializers.DateTimeField(
        source="checkin.checked_in_at", read_only=True, default=None
    )

    class Meta:
        model = FraudEvent
        fields = (
            "id",
            "user",
            "user_email",
            "checkin",
            "checkin_gym_name",
            "checkin_checked_in_at",
            "review",
            "event_type",
            "details",
            "created_at",
        )
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


class AdminCreateReviewFromEventsSerializer(serializers.Serializer):
    # Raw PKs, not PrimaryKeyRelatedField(many=True): the single-user
    # constraint is services.create_review_from_events's own job to
    # validate (as a ValidationError with a specific message), not
    # something to duplicate here as a field-level check.
    event_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, min_length=1
    )
    reason = serializers.CharField(required=False, allow_blank=True, default="")
