from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.challenges import services
from apps.challenges.models import Challenge
from apps.challenges.serializers import AdminChallengeSerializer
from apps.common.permissions import IsStaffUser


class AdminChallengeListCreateView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        queryset = Challenge.objects.all().order_by("-start_date")
        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return Response(AdminChallengeSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AdminChallengeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = services.admin_create_challenge(actor=request.user, **serializer.validated_data)
        return Response(AdminChallengeSerializer(challenge).data, status=201)


class AdminChallengeDetailView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        challenge = get_object_or_404(Challenge, pk=pk)
        return Response(AdminChallengeSerializer(challenge).data)

    def patch(self, request, pk):
        challenge = get_object_or_404(Challenge, pk=pk)
        serializer = AdminChallengeSerializer(challenge, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        challenge = services.admin_update_challenge(
            actor=request.user, challenge=challenge, **serializer.validated_data
        )
        return Response(AdminChallengeSerializer(challenge).data)
