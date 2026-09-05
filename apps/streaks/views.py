from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.streaks import services
from apps.streaks.models import UserStreak
from apps.streaks.serializers import CalendarQuerySerializer, UserStreakSerializer


class MyStreakView(RetrieveAPIView):
    serializer_class = UserStreakSerializer

    def get_object(self):
        streak, _ = UserStreak.objects.get_or_create(user=self.request.user)
        return streak


class MyCalendarView(APIView):
    def get(self, request):
        query = CalendarQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        end = query.validated_data.get("end") or timezone.localdate()
        start = query.validated_data.get("start") or (
            end - timedelta(days=services.CALENDAR_DEFAULT_RANGE_DAYS - 1)
        )

        if start > end:
            raise ValidationError("start must not be after end.")
        if (end - start).days + 1 > services.CALENDAR_MAX_RANGE_DAYS:
            raise ValidationError(
                f"Range must not exceed {services.CALENDAR_MAX_RANGE_DAYS} days."
            )

        return Response(services.get_calendar(request.user, start, end))
