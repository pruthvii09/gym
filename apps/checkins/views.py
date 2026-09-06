from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.badges.serializers import UserBadgeSerializer
from apps.checkins import services
from apps.checkins.models import CheckIn
from apps.checkins.serializers import CheckinCreateSerializer, CheckinSerializer
from apps.rewards.serializers import UserRewardListSerializer
from apps.streaks.serializers import UserStreakSerializer


class CheckinCreateView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkin_create"

    def post(self, request):
        serializer = CheckinCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.create_checkin(
            user=request.user,
            idempotency_key=request.headers.get("Idempotency-Key") or None,
            **serializer.validated_data,
        )
        data = {
            **CheckinSerializer(result.checkin).data,
            "message": result.message,
            "streak": UserStreakSerializer(result.streak).data if result.streak else None,
            "rewards_unlocked": UserRewardListSerializer(result.rewards_unlocked, many=True).data,
            "badges_unlocked": UserBadgeSerializer(result.badges_unlocked, many=True).data,
        }
        return Response(data, status=201 if result.created else 200)


class MyCheckinsView(ListAPIView):
    serializer_class = CheckinSerializer

    def get_queryset(self):
        return CheckIn.objects.filter(user=self.request.user).order_by("-checked_in_at")
