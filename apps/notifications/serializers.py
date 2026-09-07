from rest_framework import serializers

from apps.notifications.models import Notification, PushSubscription


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "type", "title", "message", "read_at", "created_at")
        read_only_fields = fields


class PushSubscriptionKeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField()
    auth = serializers.CharField()


class PushSubscriptionRegisterSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)
    keys = PushSubscriptionKeysSerializer()
    user_agent = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def save(self, *, user):
        data = self.validated_data
        subscription, _ = PushSubscription.objects.update_or_create(
            endpoint=data["endpoint"],
            defaults={
                "user": user,
                "p256dh_key": data["keys"]["p256dh"],
                "auth_key": data["keys"]["auth"],
                "user_agent": data.get("user_agent", ""),
                "disabled_at": None,
            },
        )
        return subscription


class PushSubscriptionUnregisterSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=500)
