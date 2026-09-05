from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.checkins import services as checkin_services
from apps.checkins.serializers import CheckinSerializer
from apps.gyms import services
from apps.gyms.models import Gym, GymCheckinDevice, GymMembership, GymStaffInvite
from apps.gyms.serializers import (
    GymCheckinDeviceCreateSerializer,
    GymCheckinDeviceSerializer,
    GymCreateSerializer,
    GymMemberSerializer,
    GymMembershipSerializer,
    GymSerializer,
    GymStaffInviteCreateSerializer,
    GymStaffInvitePreviewSerializer,
    GymStaffInviteSerializer,
    GymStaffRoleUpdateSerializer,
    OwnedGymUpdateSerializer,
)
from apps.streaks.serializers import UserStreakSerializer


class GymListView(ListCreateAPIView):
    queryset = Gym.objects.filter(status=Gym.Status.ACTIVE)

    def get_serializer_class(self):
        return GymCreateSerializer if self.request.method == "POST" else GymSerializer

    def get_permissions(self):
        # Browsing the directory (GET) has to work for a not-yet-logged-in visitor -- the
        # registration form needs it to populate its gym picker before an account (and
        # therefore a JWT) exists. Creating a gym (POST) still requires being logged in.
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_throttles(self):
        # Self-service gym creation is rate-limited; browsing the directory (GET) isn't --
        # matches every other write-vs-read throttling split in this app (see
        # DEFAULT_THROTTLE_RATES in config/settings.py).
        if self.request.method == "POST":
            self.throttle_scope = "gym_create"
            return [ScopedRateThrottle()]
        return []

    def create(self, request, *args, **kwargs):
        # Re-serialize the created Gym through the full read shape (GymSerializer) rather
        # than trusting CreateModelMixin's default response, which would echo back through
        # GymCreateSerializer and silently omit status/created_at/updated_at -- same reason
        # GymCheckinDeviceCreateView below builds its own Response instead of relying on
        # the generic mixin.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gym = serializer.save()
        return Response(GymSerializer(gym).data, status=201)


class GymDetailView(RetrieveUpdateAPIView):
    http_method_names = ["get", "patch", "options"]

    def get_queryset(self):
        # GET stays scoped to ACTIVE only -- same public-directory reasoning
        # as GymListView. PATCH (the owner editing their own gym) must also
        # reach a still-PENDING gym, so it isn't restricted; the real
        # authorization happens in services.update_own_gym either way.
        if self.request.method == "GET":
            return Gym.objects.filter(status=Gym.Status.ACTIVE)
        return Gym.objects.all()

    def get_serializer_class(self):
        return OwnedGymUpdateSerializer if self.request.method == "PATCH" else GymSerializer

    def get_permissions(self):
        # Same reasoning as GymListView's GET above -- a single gym's public
        # directory info needs to be readable before an account exists.
        # Editing it is gated inside services.update_own_gym (OWNER-only at
        # that specific gym), not here -- IsAuthenticated is just the floor.
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        # Re-serialize through the full read shape (GymSerializer) rather
        # than trusting UpdateModelMixin's default response, which would
        # echo back through OwnedGymUpdateSerializer and omit id/status/
        # created_at/updated_at -- same reasoning as GymListView.create().
        partial = kwargs.pop("partial", True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        gym = serializer.save()
        return Response(GymSerializer(gym).data)


class GymMemberListView(ListAPIView):
    serializer_class = GymMemberSerializer

    def get_queryset(self):
        gym = get_object_or_404(Gym, pk=self.kwargs["pk"])
        return services.list_gym_members(actor=self.request.user, gym=gym)


class GymMemberDetailView(APIView):
    def get(self, request, pk, membership_id):
        gym = get_object_or_404(Gym, pk=pk)
        membership, streak, recent_checkins = checkin_services.get_gym_member_detail(
            actor=request.user, gym=gym, membership_id=membership_id
        )
        data = {
            **GymMemberSerializer(membership).data,
            "streak": UserStreakSerializer(streak).data,
            "recent_checkins": CheckinSerializer(recent_checkins, many=True).data,
        }
        return Response(data)

    def delete(self, request, pk, membership_id):
        gym = get_object_or_404(Gym, pk=pk)
        membership = get_object_or_404(
            GymMembership, pk=membership_id, gym=gym, role=GymMembership.Role.MEMBER
        )
        services.remove_gym_member(actor=request.user, gym=gym, membership=membership)
        return Response(status=204)


class GymDeviceListView(ListAPIView):
    serializer_class = GymCheckinDeviceSerializer

    def get_queryset(self):
        gym = get_object_or_404(Gym, pk=self.kwargs["pk"])
        return services.list_gym_devices(actor=self.request.user, gym=gym)


class GymStaffListView(ListAPIView):
    serializer_class = GymMemberSerializer

    def get_queryset(self):
        gym = get_object_or_404(Gym, pk=self.kwargs["pk"])
        return services.list_gym_staff(actor=self.request.user, gym=gym)


class GymStaffDetailView(APIView):
    def patch(self, request, pk, membership_id):
        gym = get_object_or_404(Gym, pk=pk)
        membership = get_object_or_404(GymMembership, pk=membership_id, gym=gym)
        serializer = GymStaffRoleUpdateSerializer(
            data=request.data,
            context={"request": request, "gym": gym, "membership": membership},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        return Response(GymMemberSerializer(membership).data)

    def delete(self, request, pk, membership_id):
        gym = get_object_or_404(Gym, pk=pk)
        membership = get_object_or_404(GymMembership, pk=membership_id, gym=gym)
        services.remove_gym_staff(actor=request.user, gym=gym, membership=membership)
        return Response(status=204)


class GymStaffInviteListCreateView(APIView):
    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "gym_staff_invite_create"
            return [ScopedRateThrottle()]
        return []

    def get(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        invites = services.list_gym_staff_invites(actor=request.user, gym=gym)
        return Response(GymStaffInviteSerializer(invites, many=True).data)

    def post(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        serializer = GymStaffInviteCreateSerializer(
            data=request.data, context={"request": request, "gym": gym}
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        return Response(GymStaffInviteSerializer(invite).data, status=201)


class GymStaffInviteRevokeView(APIView):
    def post(self, request, pk, invite_id):
        gym = get_object_or_404(Gym, pk=pk)
        invite = get_object_or_404(GymStaffInvite, pk=invite_id, gym=gym)
        invite = services.revoke_gym_staff_invite(actor=request.user, gym=gym, invite=invite)
        return Response(GymStaffInviteSerializer(invite).data)


class GymStaffInvitePreviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        invite = services.preview_gym_staff_invite(token)
        return Response(GymStaffInvitePreviewSerializer(invite).data)


class GymStaffInviteAcceptView(APIView):
    # No permission_classes override -- falls back to the project default
    # (IsAuthenticated), which is exactly right: accepting always requires
    # being logged in first (see services.accept_gym_staff_invite).
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gym_staff_invite_accept"

    def post(self, request, token):
        membership = services.accept_gym_staff_invite(user=request.user, raw_token=token)
        return Response(GymMembershipSerializer(membership).data)


class MyGymMembershipsView(ListAPIView):
    serializer_class = GymMembershipSerializer

    def get_queryset(self):
        return GymMembership.objects.filter(user=self.request.user).select_related("gym")


class GymCheckinDeviceCreateView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gym_device_create"

    def post(self, request):
        serializer = GymCheckinDeviceCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        device, secret = serializer.save()
        data = {**GymCheckinDeviceSerializer(device).data, "secret": secret}
        return Response(data, status=201)


class GymCheckinDeviceRotateView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gym_device_rotate"

    def post(self, request, pk):
        device = get_object_or_404(GymCheckinDevice, pk=pk)
        device, secret = services.rotate_gym_device(user=request.user, device=device)
        data = {**GymCheckinDeviceSerializer(device).data, "secret": secret}
        return Response(data)


class GymCheckinDeviceQrView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gym_device_qr"

    def get(self, request, pk):
        device = get_object_or_404(GymCheckinDevice, pk=pk)
        session, signed_token = services.mint_checkin_qr(user=request.user, device=device)
        return Response(
            {
                "token": signed_token,
                "expires_at": session.expires_at,
                "gym_id": session.gym_id,
                "device_id": session.device_id,
            }
        )
