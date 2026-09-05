from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.rewards import services
from apps.rewards.models import RewardDefinition, UserReward
from apps.rewards.serializers import (
    RewardClaimRequestSerializer,
    RewardClaimSerializer,
    RewardDefinitionSerializer,
    UserRewardDetailSerializer,
    UserRewardListSerializer,
)


class RewardDefinitionListView(ListAPIView):
    serializer_class = RewardDefinitionSerializer
    queryset = (
        RewardDefinition.objects.filter(status=RewardDefinition.Status.ACTIVE)
        .select_related("product")
        .prefetch_related("product__variants")
    )


class RewardDefinitionDetailView(RetrieveAPIView):
    serializer_class = RewardDefinitionSerializer
    queryset = (
        RewardDefinition.objects.filter(status=RewardDefinition.Status.ACTIVE)
        .select_related("product")
        .prefetch_related("product__variants")
    )


class RewardClaimCreateView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reward_claim"

    def post(self, request, pk):
        # Deliberately unfiltered lookup (not status=ACTIVE): a user who
        # earned this reward before its tier went INACTIVE must still be
        # able to claim it. INACTIVE only blocks new eligibility and
        # list/retrieve visibility, not an already-earned claim.
        reward_definition = get_object_or_404(RewardDefinition, pk=pk)
        serializer = RewardClaimRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.claim_reward(
            user=request.user,
            reward_definition=reward_definition,
            variant_id=serializer.validated_data["variant_id"],
            address=serializer.validated_data["address"],
        )
        data = RewardClaimSerializer(result.claim).data
        if result.created:
            data["redemption_code"] = result.redemption_code
        return Response(data, status=201 if result.created else 200)


class MyUserRewardListView(ListAPIView):
    serializer_class = UserRewardListSerializer

    def get_queryset(self):
        return (
            UserReward.objects.filter(user=self.request.user)
            .select_related("reward_definition__product")
            .order_by("-earned_at")
        )


class MyUserRewardDetailView(RetrieveAPIView):
    serializer_class = UserRewardDetailSerializer

    def get_queryset(self):
        return UserReward.objects.filter(user=self.request.user).select_related(
            "reward_definition__product"
        )
