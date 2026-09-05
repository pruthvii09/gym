from rest_framework import serializers

from apps.rewards.models import ProductVariant, RewardClaim, RewardDefinition, UserReward


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
    variants = ProductVariantLiteSerializer(source="product.variants", many=True, read_only=True)

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
            "created_at",
        )
        read_only_fields = fields


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


class UserRewardDetailSerializer(UserRewardListSerializer):
    # SerializerMethodField, not a nested RewardClaimSerializer(read_only=True):
    # a missing reverse OneToOneField raises RelatedObjectDoesNotExist (a
    # subclass of AttributeError), which DRF's plain field.get_attribute
    # treats as "omit this key" rather than "serialize as null". Handling it
    # explicitly here guarantees the key is always present, null until claimed.
    claim = serializers.SerializerMethodField()

    class Meta(UserRewardListSerializer.Meta):
        fields = UserRewardListSerializer.Meta.fields + ("claim",)

    def get_claim(self, obj):
        claim = getattr(obj, "claim", None)
        return RewardClaimSerializer(claim).data if claim else None
