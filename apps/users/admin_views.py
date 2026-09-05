from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsStaffUser
from apps.fraud.services import block_reward_claims
from apps.users import services
from apps.users.admin_serializers import (
    AdminUserBlockRewardClaimsSerializer,
    AdminUserSerializer,
    AdminUserStatusUpdateSerializer,
)
from apps.users.models import User


class AdminUserListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        queryset = User.objects.all().order_by("-created_at")
        params = self.request.query_params

        search = params.get("search")
        if search:
            queryset = queryset.filter(email__icontains=search)

        is_active = params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("true", "1"))

        return queryset


class AdminUserDetailView(RetrieveAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminUserSerializer
    queryset = User.objects.all()


class AdminUserStatusUpdateView(APIView):
    """Suspend (`is_active: false`) or restore (`is_active: true`) a user."""

    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        serializer = AdminUserStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = services.set_user_active(
            actor=request.user,
            user=user,
            is_active=serializer.validated_data["is_active"],
            reason=serializer.validated_data["reason"],
        )
        return Response(AdminUserSerializer(updated).data)


class AdminUserBlockRewardClaimsView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        serializer = AdminUserBlockRewardClaimsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = block_reward_claims(
            actor=request.user, user=user, reason=serializer.validated_data["reason"] or "Manually blocked by admin"
        )
        return Response({"fraud_review_id": review.id, "risk_level": review.risk_level})
