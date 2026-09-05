from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.checkins import services
from apps.checkins.admin_serializers import AdminCheckInResolveSerializer, AdminCheckInSerializer
from apps.checkins.models import CheckIn
from apps.common.permissions import IsStaffUser


class AdminCheckInListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminCheckInSerializer

    def get_queryset(self):
        queryset = CheckIn.objects.select_related("user", "gym").order_by("-created_at")
        params = self.request.query_params

        user_id = params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        gym_id = params.get("gym")
        if gym_id:
            queryset = queryset.filter(gym_id=gym_id)

        status_param = params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset


class AdminCheckInDetailView(RetrieveAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminCheckInSerializer
    queryset = CheckIn.objects.select_related("user", "gym").all()


class AdminCheckInResolveView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        checkin = get_object_or_404(CheckIn, pk=pk)
        serializer = AdminCheckInResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        checkin = services.resolve_checkin(
            actor=request.user,
            checkin=checkin,
            new_status=serializer.validated_data["status"],
            reason=serializer.validated_data["reason"],
        )
        return Response(AdminCheckInSerializer(checkin).data)
