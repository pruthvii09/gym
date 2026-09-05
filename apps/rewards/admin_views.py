from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.pagination import DefaultPageNumberPagination
from apps.common.permissions import IsStaffUser
from apps.rewards import services
from apps.rewards.admin_serializers import (
    AdminInventoryAdjustSerializer,
    AdminInventoryRestockSerializer,
    AdminInventoryTransactionSerializer,
    AdminProductSerializer,
    AdminProductVariantCreateSerializer,
    AdminProductVariantSerializer,
    AdminRewardClaimSerializer,
    AdminRewardClaimTransitionSerializer,
    AdminRewardDefinitionRejectSerializer,
    AdminRewardDefinitionSerializer,
)
from apps.rewards.models import (
    InventoryTransaction,
    Product,
    ProductVariant,
    RewardClaim,
    RewardDefinition,
    RewardStatus,
)


# --- Products & variants -----------------------------------------------------


class AdminProductListCreateView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        queryset = Product.objects.all().order_by("name")
        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return Response(AdminProductSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AdminProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = services.admin_create_product(actor=request.user, **serializer.validated_data)
        return Response(AdminProductSerializer(product).data, status=201)


class AdminProductDetailView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        return Response(AdminProductSerializer(product).data)

    def patch(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        serializer = AdminProductSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        product = services.admin_update_product(
            actor=request.user, product=product, **serializer.validated_data
        )
        return Response(AdminProductSerializer(product).data)


class AdminProductVariantListCreateView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        queryset = ProductVariant.objects.select_related("product").order_by(
            "product__name", "size"
        )
        product_id = request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return Response(AdminProductVariantSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AdminProductVariantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = services.admin_create_variant(actor=request.user, **serializer.validated_data)
        return Response(AdminProductVariantSerializer(variant).data, status=201)


class AdminProductVariantDetailView(RetrieveAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminProductVariantSerializer
    queryset = ProductVariant.objects.select_related("product").all()


# --- Reward definitions -------------------------------------------------------


class AdminRewardDefinitionListCreateView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        queryset = RewardDefinition.objects.select_related("product").order_by("required_streak")
        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)
        return Response(AdminRewardDefinitionSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = AdminRewardDefinitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reward_definition = services.admin_create_reward_definition(
            actor=request.user, **serializer.validated_data
        )
        return Response(AdminRewardDefinitionSerializer(reward_definition).data, status=201)


class AdminRewardDefinitionDetailView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request, pk):
        reward_definition = get_object_or_404(RewardDefinition, pk=pk)
        return Response(AdminRewardDefinitionSerializer(reward_definition).data)

    def patch(self, request, pk):
        reward_definition = get_object_or_404(RewardDefinition, pk=pk)
        serializer = AdminRewardDefinitionSerializer(
            reward_definition, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        reward_definition = services.admin_update_reward_definition(
            actor=request.user, reward_definition=reward_definition, **serializer.validated_data
        )
        return Response(AdminRewardDefinitionSerializer(reward_definition).data)


class AdminRewardDefinitionApproveView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        reward_definition = get_object_or_404(RewardDefinition, pk=pk)
        reward_definition = services.admin_approve_reward_definition(
            actor=request.user, reward_definition=reward_definition
        )
        return Response(AdminRewardDefinitionSerializer(reward_definition).data)


class AdminRewardDefinitionRejectView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        reward_definition = get_object_or_404(RewardDefinition, pk=pk)
        serializer = AdminRewardDefinitionRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reward_definition = services.admin_reject_reward_definition(
            actor=request.user,
            reward_definition=reward_definition,
            reason=serializer.validated_data["reason"],
        )
        return Response(AdminRewardDefinitionSerializer(reward_definition).data)


# --- Reward claims & shipping -------------------------------------------------


class AdminRewardClaimListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminRewardClaimSerializer
    pagination_class = DefaultPageNumberPagination

    def get_queryset(self):
        queryset = RewardClaim.objects.select_related(
            "user_reward__user", "user_reward__reward_definition", "variant__product"
        ).order_by("-created_at")
        params = self.request.query_params

        status_param = params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        user_id = params.get("user")
        if user_id:
            queryset = queryset.filter(user_reward__user_id=user_id)

        return queryset


class AdminRewardClaimDetailView(RetrieveAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminRewardClaimSerializer
    queryset = RewardClaim.objects.select_related(
        "user_reward__user", "user_reward__reward_definition", "variant__product"
    ).all()


class AdminRewardClaimTransitionView(APIView):
    """The fulfillment state machine's only entry point over the API:
    CLAIMED -> PROCESSING -> SHIPPED -> DELIVERED, or CANCELLED before
    shipping. See apps.rewards.services.CLAIM_ALLOWED_TRANSITIONS.
    """

    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        claim = get_object_or_404(RewardClaim, pk=pk)
        serializer = AdminRewardClaimTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        claim = services.transition_claim_status(
            actor=request.user,
            claim=claim,
            new_status=data["status"],
            reason=data["reason"],
            tracking_number=data.get("tracking_number"),
            carrier=data.get("carrier"),
        )
        return Response(AdminRewardClaimSerializer(claim).data)


class AdminShipmentListView(ListAPIView):
    """'Shipping' as an admin area: claims that have moved past pure
    reservation, i.e. everything staff are actively fulfilling or have
    already fulfilled. Read-only view over the same RewardClaim data --
    AdminRewardClaimTransitionView remains the one place shipping state
    actually changes.
    """

    permission_classes = [IsStaffUser]
    serializer_class = AdminRewardClaimSerializer
    pagination_class = DefaultPageNumberPagination

    def get_queryset(self):
        return (
            RewardClaim.objects.filter(
                status__in=[RewardStatus.PROCESSING, RewardStatus.SHIPPED, RewardStatus.DELIVERED]
            )
            .select_related("user_reward__user", "user_reward__reward_definition", "variant__product")
            .order_by("-shipped_at", "-created_at")
        )


# --- Inventory ----------------------------------------------------------------


class AdminInventoryTransactionListView(ListAPIView):
    permission_classes = [IsStaffUser]
    serializer_class = AdminInventoryTransactionSerializer
    pagination_class = DefaultPageNumberPagination

    def get_queryset(self):
        queryset = InventoryTransaction.objects.select_related("variant__product").order_by(
            "-created_at"
        )
        params = self.request.query_params

        variant_id = params.get("variant")
        if variant_id:
            queryset = queryset.filter(variant_id=variant_id)

        type_param = params.get("type")
        if type_param:
            queryset = queryset.filter(type=type_param)

        return queryset


class AdminInventoryRestockView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        variant = get_object_or_404(ProductVariant, pk=pk)
        serializer = AdminInventoryRestockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = services.restock_variant(
            variant=variant, actor=request.user, **serializer.validated_data
        )
        return Response(AdminProductVariantSerializer(variant).data)


class AdminInventoryAdjustView(APIView):
    permission_classes = [IsStaffUser]

    def post(self, request, pk):
        variant = get_object_or_404(ProductVariant, pk=pk)
        serializer = AdminInventoryAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variant = services.adjust_inventory(
            variant=variant, actor=request.user, **serializer.validated_data
        )
        return Response(AdminProductVariantSerializer(variant).data)


class AdminInventoryReservedView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        return Response(list(services.reserved_inventory_summary()))


class AdminInventoryShippedView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        return Response(list(services.shipped_inventory_summary()))
