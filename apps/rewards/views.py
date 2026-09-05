from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.gyms.models import Gym
from apps.rewards import services
from apps.rewards.models import Product, RewardDefinition, UserReward
from apps.rewards.serializers import (
    GymRedemptionVerifySerializer,
    GymPerkRedemptionSerializer,
    GymRewardProposeSerializer,
    GymRewardSerializer,
    GymRewardUpdateSerializer,
    ProductBrowseSerializer,
    RewardClaimRequestSerializer,
    RewardClaimSerializer,
    RewardDefinitionSerializer,
    RewardProgressSerializer,
    UserRewardDetailSerializer,
    UserRewardListSerializer,
)


class RewardDefinitionListView(ListAPIView):
    serializer_class = RewardDefinitionSerializer

    def get_queryset(self):
        return (
            RewardDefinition.objects.filter(status=RewardDefinition.Status.ACTIVE)
            .filter(services.reward_gym_scope_filter(self.request.user))
            .select_related("product")
            .prefetch_related("product__variants")
        )


class RewardDefinitionDetailView(RetrieveAPIView):
    serializer_class = RewardDefinitionSerializer

    def get_queryset(self):
        return (
            RewardDefinition.objects.filter(status=RewardDefinition.Status.ACTIVE)
            .filter(services.reward_gym_scope_filter(self.request.user))
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


class RewardRedeemCreateView(APIView):
    """The PERK analogue of RewardClaimCreateView -- no input body, nothing
    to ship.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reward_redeem"

    def post(self, request, pk):
        reward_definition = get_object_or_404(RewardDefinition, pk=pk)
        result = services.redeem_perk(user=request.user, reward_definition=reward_definition)
        data = GymPerkRedemptionSerializer(result.redemption).data
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


class MyRewardsOverviewView(APIView):
    """Powers the member dashboard's rewards section: every ACTIVE reward
    visible to this user (their gym's approved tiers + platform-wide ones),
    each paired with earned/claimed status and days-remaining progress.
    """

    def get(self, request):
        overview = services.member_rewards_overview(request.user)
        return Response(RewardProgressSerializer(overview, many=True).data)


class ProductListView(ListAPIView):
    """Read-only, authenticated-only catalog browse -- lets a gym owner
    pick a product when proposing a merchandise reward. Deliberately
    narrower than the IsStaffUser admin product endpoints (no stock
    mutation, no inactive products).
    """

    serializer_class = ProductBrowseSerializer
    queryset = Product.objects.filter(status=Product.Status.ACTIVE).order_by("name")


class GymRewardListCreateView(APIView):
    def get(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        rewards = services.list_gym_rewards(actor=request.user, gym=gym)
        return Response(GymRewardSerializer(rewards, many=True).data)

    def post(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        serializer = GymRewardProposeSerializer(
            data=request.data, context={"request": request, "gym": gym}
        )
        serializer.is_valid(raise_exception=True)
        reward_definition = serializer.save()
        return Response(GymRewardSerializer(reward_definition).data, status=201)


class GymRewardDetailView(APIView):
    def patch(self, request, pk, reward_id):
        gym = get_object_or_404(Gym, pk=pk)
        reward_definition = get_object_or_404(RewardDefinition, pk=reward_id, gym=gym)
        serializer = GymRewardUpdateSerializer(
            data=request.data,
            partial=True,
            context={"request": request, "gym": gym, "reward_definition": reward_definition},
        )
        serializer.is_valid(raise_exception=True)
        reward_definition = serializer.save()
        return Response(GymRewardSerializer(reward_definition).data)


class GymRewardRedemptionVerifyView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gym_reward_redemption_verify"

    def post(self, request, pk):
        gym = get_object_or_404(Gym, pk=pk)
        serializer = GymRedemptionVerifySerializer(
            data=request.data, context={"request": request, "gym": gym}
        )
        serializer.is_valid(raise_exception=True)
        redemption = serializer.save()
        return Response(GymPerkRedemptionSerializer(redemption).data)
