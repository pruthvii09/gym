from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsStaffUser
from apps.streaks import services
from apps.streaks.admin_serializers import AdminStreakPolicySerializer, AdminUserStreakSerializer
from apps.streaks.models import StreakPolicy, UserStreak
from apps.users.models import User


class AdminUserStreakListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminUserStreakSerializer

    def get_queryset(self):
        return UserStreak.objects.select_related("user").order_by("-current_streak")


class AdminUserStreakDetailView(RetrieveAPIView):
    """Looked up by user id, not the UserStreak row's own id -- an admin
    thinks in terms of "this user's streak", and a user has at most one.
    """

    permission_classes = [IsStaffUser]
    serializer_class = AdminUserStreakSerializer

    def get_object(self):
        user = get_object_or_404(User, pk=self.kwargs["user_id"])
        streak, _ = UserStreak.objects.get_or_create(user=user)
        return streak


class AdminUserStreakRebuildView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, user_id):
        user = get_object_or_404(User, pk=user_id)
        streak = services.admin_rebuild_streak(actor=request.user, user=user)
        return Response(AdminUserStreakSerializer(streak).data)


class AdminStreakRebuildAllView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request):
        count = services.admin_rebuild_all_streaks(actor=request.user)
        return Response({"rebuilt": count})


class AdminStreakPolicyView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        policy, _ = StreakPolicy.objects.get_or_create()
        return Response(AdminStreakPolicySerializer(policy).data)

    def patch(self, request):
        policy, _ = StreakPolicy.objects.get_or_create()
        serializer = AdminStreakPolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        policy = services.admin_update_policy(
            actor=request.user, policy=policy, **serializer.validated_data
        )
        return Response(AdminStreakPolicySerializer(policy).data)
