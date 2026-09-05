from rest_framework import serializers

from apps.rewards.models import (
    InventoryTransaction,
    Product,
    ProductVariant,
    RewardClaim,
    RewardDefinition,
    RewardStatus,
)


class AdminProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("id", "name", "sku", "type", "status", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class AdminProductVariantSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ProductVariant
        fields = ("id", "product", "product_name", "size", "stock", "created_at", "updated_at")
        # stock is never client-settable, even here -- it's only ever moved
        # through restock_variant/adjust_inventory/claim reservation, each of
        # which writes an InventoryTransaction. See apps.rewards.services.
        read_only_fields = ("id", "stock", "created_at", "updated_at")


class AdminProductVariantCreateSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    size = serializers.CharField(max_length=32)
    initial_stock = serializers.IntegerField(required=False, min_value=0, default=0)


class AdminRewardDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RewardDefinition
        fields = (
            "id",
            "name",
            "description",
            "reward_type",
            "required_streak",
            "product",
            "status",
            "terms",
            "require_email_verified",
            "require_phone_verified",
            "minimum_account_age_days",
            "minimum_verified_checkins",
            "block_if_high_risk_review",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class AdminRewardClaimSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user_reward.user.email", read_only=True)
    reward_definition_name = serializers.CharField(
        source="user_reward.reward_definition.name", read_only=True
    )

    class Meta:
        model = RewardClaim
        fields = (
            "id",
            "user_reward",
            "user_email",
            "reward_definition_name",
            "variant",
            "shipping_address",
            "tracking_number",
            "carrier",
            "shipped_at",
            "delivered_at",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class AdminRewardClaimTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=RewardStatus.choices)
    tracking_number = serializers.CharField(required=False, allow_blank=True)
    carrier = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class AdminInventoryTransactionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    variant_size = serializers.CharField(source="variant.size", read_only=True)

    class Meta:
        model = InventoryTransaction
        fields = (
            "id",
            "variant",
            "product_name",
            "variant_size",
            "quantity",
            "type",
            "reference",
            "created_at",
        )
        read_only_fields = fields


class AdminInventoryRestockSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True, default="")


class AdminInventoryAdjustSerializer(serializers.Serializer):
    quantity = serializers.IntegerField()
    reason = serializers.CharField(allow_blank=False)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
