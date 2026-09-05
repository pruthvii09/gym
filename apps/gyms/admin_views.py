from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsStaffUser
from apps.gyms import services
from apps.gyms.admin_serializers import (
    AdminDeviceStatusUpdateSerializer,
    AdminGymCheckinDeviceSerializer,
    AdminGymMembershipSerializer,
    AdminGymRejectSerializer,
    AdminGymSerializer,
)
from apps.gyms.models import Gym, GymCheckinDevice, GymMembership


class AdminGymListCreateView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        queryset = Gym.objects.all().order_by("name")
        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return Response(AdminGymSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AdminGymSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gym = services.admin_create_gym(actor=request.user, **serializer.validated_data)
        return Response(AdminGymSerializer(gym).data, status=201)


class AdminGymDetailView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        return Response(AdminGymSerializer(gym).data)

    def patch(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        serializer = AdminGymSerializer(gym, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        gym = services.admin_update_gym(actor=request.user, gym=gym, **serializer.validated_data)
        return Response(AdminGymSerializer(gym).data)


class AdminGymApproveView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        gym = services.admin_approve_gym(actor=request.user, gym=gym)
        return Response(AdminGymSerializer(gym).data)


class AdminGymRejectView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        serializer = AdminGymRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gym = services.admin_reject_gym(
            actor=request.user, gym=gym, reason=serializer.validated_data["reason"]
        )
        return Response(AdminGymSerializer(gym).data)


class AdminGymMembershipListCreateView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        queryset = GymMembership.objects.select_related("user", "gym").all()
        gym_id = request.query_params.get("gym")
        if gym_id:
            queryset = queryset.filter(gym_id=gym_id)
        user_id = request.query_params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        return Response(AdminGymMembershipSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AdminGymMembershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = services.admin_assign_membership(
            actor=request.user, **serializer.validated_data
        )
        return Response(AdminGymMembershipSerializer(membership).data, status=201)


class AdminGymCheckinDeviceListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminGymCheckinDeviceSerializer

    def get_queryset(self):
        queryset = GymCheckinDevice.objects.select_related("gym").all()
        gym_id = self.request.query_params.get("gym")
        if gym_id:
            queryset = queryset.filter(gym_id=gym_id)
        return queryset


class AdminGymCheckinDeviceDetailView(RetrieveAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminGymCheckinDeviceSerializer
    queryset = GymCheckinDevice.objects.select_related("gym").all()


class AdminGymCheckinDeviceStatusUpdateView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        device = get_object_or_404(GymCheckinDevice, pk=pk)
        serializer = AdminDeviceStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = services.admin_set_device_status(
            actor=request.user,
            device=device,
            status=serializer.validated_data["status"],
            reason=serializer.validated_data["reason"],
        )
        return Response(AdminGymCheckinDeviceSerializer(device).data)
