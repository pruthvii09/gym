from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsStaffUser
from apps.fraud import services
from apps.fraud.admin_serializers import (
    AdminCreateReviewFromEventsSerializer,
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

        risk_level = params.get("risk_level")
        if risk_level:
            queryset = queryset.filter(risk_level=risk_level)

        search = params.get("search")
        if search:
            queryset = queryset.filter(user__email__icontains=search)

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
        queryset = FraudEvent.objects.select_related("user", "checkin__gym").order_by(
            "-created_at"
        )
        params = self.request.query_params

        user_id = params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        event_type = params.get("event_type")
        if event_type:
            queryset = queryset.filter(event_type=event_type)

        search = params.get("search")
        if search:
            queryset = queryset.filter(user__email__icontains=search)

        review_id = params.get("review")
        if review_id:
            queryset = queryset.filter(review_id=review_id)

        return queryset


class AdminCreateReviewFromEventsView(APIView):
    """Exposes apps.fraud.services.create_review_from_events over the API --
    previously only reachable via FraudEventAdmin's bulk action. Lets staff
    escalate a pattern they spot in the event log into a review even when
    it never crossed the automatic HIGH threshold.
    """

    permission_classes = [IsStaffUser]

    def post(self, request):
        serializer = AdminCreateReviewFromEventsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        events = FraudEvent.objects.filter(pk__in=serializer.validated_data["event_ids"])
        review = services.create_review_from_events(
            actor=request.user, events=events, reason=serializer.validated_data["reason"]
        )
        return Response(AdminFraudReviewSerializer(review).data, status=201)
