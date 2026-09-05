from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsStaffUser
from apps.fraud import services
from apps.fraud.admin_serializers import (
    AdminFraudEventSerializer,
    AdminFraudReviewResolveSerializer,
    AdminFraudReviewSerializer,
)
from apps.fraud.models import FraudEvent, FraudReview


class AdminFraudReviewListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminFraudReviewSerializer

    def get_queryset(self):
        queryset = FraudReview.objects.select_related("user", "resolved_by").order_by("-created_at")
        params = self.request.query_params

        status_param = params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        user_id = params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        return queryset


class AdminFraudReviewDetailView(RetrieveAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminFraudReviewSerializer
    queryset = FraudReview.objects.select_related("user", "resolved_by").all()


class AdminFraudReviewResolveView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        review = get_object_or_404(FraudReview, pk=pk)
        serializer = AdminFraudReviewResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = services.resolve_review(
            actor=request.user,
            review=review,
            new_status=serializer.validated_data["status"],
            resolution_notes=serializer.validated_data["resolution_notes"],
        )
        return Response(AdminFraudReviewSerializer(review).data)


class AdminFraudEventListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminFraudEventSerializer

    def get_queryset(self):
        queryset = FraudEvent.objects.select_related("user").order_by("-created_at")
        params = self.request.query_params

        user_id = params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        event_type = params.get("event_type")
        if event_type:
            queryset = queryset.filter(event_type=event_type)

        return queryset
