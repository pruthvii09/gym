from rest_framework import serializers

from apps.rewards import services
from apps.rewards.models import (
    PerkRedemption,
    Product,
    ProductVariant,
    RewardClaim,
    RewardDefinition,
    UserReward,
)


class ShippingAddressSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    line1 = serializers.CharField(max_length=255)
    line2 = serializers.CharField(max_length=255, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20)
    country = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)


class RewardClaimRequestSerializer(serializers.Serializer):
    # Raw UUIDField, not PrimaryKeyRelatedField: the variant is locked and
    # mutated inside services.claim_reward -- resolving it here would hand
    # the service a possibly-stale instance. All existence/relationship/
    # locking logic for the variant lives in the service.
    variant_id = serializers.UUIDField()
    address = ShippingAddressSerializer()


class ProductVariantLiteSerializer(serializers.ModelSerializer):
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ("id", "size", "in_stock")

    def get_in_stock(self, obj):
        return obj.stock > 0


class RewardDefinitionSerializer(serializers.ModelSerializer):
    # SerializerMethodField, not source="product.variants": product is null
    # for PERK rewards, and DRF's plain field.get_attribute would raise
    # AttributeError trying to resolve `.variants` off None.
    variants = serializers.SerializerMethodField()
    gym_name = serializers.CharField(source="gym.name", read_only=True, default=None)

    class Meta:
        model = RewardDefinition
        fields = (
            "id",
            "name",
            "description",
            "reward_type",
            "required_streak",
            "terms",
            "variants",
            "gym_name",
            "created_at",
        )
        read_only_fields = fields

    def get_variants(self, obj):
        if not obj.product_id:
            return []
        return ProductVariantLiteSerializer(obj.product.variants.all(), many=True).data


class RewardClaimSerializer(serializers.ModelSerializer):
    class Meta:
        model = RewardClaim
        fields = (
            "id",
            "variant",
            "shipping_address",
            "tracking_number",
            "carrier",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class UserRewardListSerializer(serializers.ModelSerializer):
    reward_definition = RewardDefinitionSerializer(read_only=True)

    class Meta:
        model = UserReward
        fields = ("id", "reward_definition", "status", "earned_at", "claimed_at")
        read_only_fields = fields


class PerkRedemptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerkRedemption
        fields = ("id", "status", "verified_at", "created_at")
        read_only_fields = fields


class UserRewardDetailSerializer(UserRewardListSerializer):
    # SerializerMethodField, not a nested RewardClaimSerializer(read_only=True):
    # a missing reverse OneToOneField raises RelatedObjectDoesNotExist (a
    # subclass of AttributeError), which DRF's plain field.get_attribute
    # treats as "omit this key" rather than "serialize as null". Handling it
    # explicitly here guarantees the key is always present, null until claimed.
    claim = serializers.SerializerMethodField()
    perk_redemption = serializers.SerializerMethodField()

    class Meta(UserRewardListSerializer.Meta):
        fields = UserRewardListSerializer.Meta.fields + ("claim", "perk_redemption")

    def get_claim(self, obj):
        claim = getattr(obj, "claim", None)
        return RewardClaimSerializer(claim).data if claim else None

    def get_perk_redemption(self, obj):
        redemption = getattr(obj, "perk_redemption", None)
        return PerkRedemptionSerializer(redemption).data if redemption else None


class RewardProgressSerializer(serializers.Serializer):
    """Wraps apps.rewards.services.RewardProgress (a dataclass, not a
    model) -- powers the member dashboard's rewards section.
    """

    reward_definition = RewardDefinitionSerializer()
    user_reward = UserRewardListSerializer(allow_null=True)
    days_remaining = serializers.IntegerField()


class ProductBrowseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("id", "name", "sku", "type")
        read_only_fields = fields


class GymRewardSerializer(serializers.ModelSerializer):
    """Read shape for a gym's own reward list/detail (gym-manage UI) --
    includes `status` (pending/active/rejected/inactive) so the owner can
    see where their proposal stands. Deliberately omits the 5 eligibility
    gate fields, which stay platform-staff-only.
    """

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
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "status", "created_at", "updated_at")


class GymRewardProposeSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    reward_type = serializers.ChoiceField(choices=RewardDefinition.RewardType.choices)
    required_streak = serializers.IntegerField(min_value=1)
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(status=Product.Status.ACTIVE), required=False
    )
    terms = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        services.validate_reward_fulfillment(
            reward_type=attrs["reward_type"],
            product=attrs.get("product"),
            gym=self.context["gym"],
        )
        return attrs

    def save(self):
        request = self.context["request"]
        return services.propose_gym_reward(
            actor=request.user, gym=self.context["gym"], **self.validated_data
        )


class GymRewardUpdateSerializer(GymRewardProposeSerializer):
    name = serializers.CharField(max_length=255, required=False)
    reward_type = serializers.ChoiceField(
        choices=RewardDefinition.RewardType.choices, required=False
    )
    required_streak = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        instance = self.context["reward_definition"]
        services.validate_reward_fulfillment(
            reward_type=attrs.get("reward_type", instance.reward_type),
            product=attrs.get("product", instance.product),
            gym=self.context["gym"],
        )
        return attrs

    def save(self):
        request = self.context["request"]
        return services.update_gym_reward(
            actor=request.user,
            gym=self.context["gym"],
            reward_definition=self.context["reward_definition"],
            **self.validated_data,
        )


class GymRedemptionVerifySerializer(serializers.Serializer):
    code = serializers.CharField()

    def save(self):
        request = self.context["request"]
        return services.verify_perk_redemption(
            actor=request.user, gym=self.context["gym"], code=self.validated_data["code"]
        )


class GymPerkRedemptionSerializer(serializers.ModelSerializer):
    """Gym-staff-facing verify response -- includes who earned it, unlike
    the member-facing PerkRedemptionSerializer.
    """

    user_email = serializers.EmailField(source="user_reward.user.email", read_only=True)
    reward_name = serializers.CharField(
        source="user_reward.reward_definition.name", read_only=True
    )

    class Meta:
        model = PerkRedemption
        fields = ("id", "user_email", "reward_name", "status", "verified_at", "created_at")
        read_only_fields = fields
