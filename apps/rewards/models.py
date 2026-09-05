from django.db import models
from django.utils import timezone

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class Product(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=64, unique=True)
    type = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class ProductVariant(UUIDTimeStampedModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    size = models.CharField(max_length=32)
    # Cache: authoritatively the running sum of this variant's
    # InventoryTransaction ledger. Mirrors the CheckIn -> UserStreak
    # cached/derived architecture.
    stock = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("product", "size")
        indexes = [models.Index(fields=["product"])]

    def __str__(self):
        return f"{self.product.name} / {self.size}"


class InventoryTransaction(UUIDTimeStampedModel):
    class Type(models.TextChoices):
        RESTOCK = "restock", "Restock"
        RESERVE = "reserve", "Reserve"
        RELEASE = "release", "Release"
        SHIP = "ship", "Ship"
        ADJUSTMENT = "adjustment", "Adjustment"

    variant = models.ForeignKey(
        ProductVariant, on_delete=models.PROTECT, related_name="transactions"
    )
    # Not PositiveIntegerField: RESERVE is negative.
    quantity = models.IntegerField()
    type = models.CharField(max_length=16, choices=Type.choices)
    reference = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [models.Index(fields=["variant", "created_at"])]

    def __str__(self):
        return f"{self.type} {self.quantity} for {self.variant_id}"


class RewardStatus(models.TextChoices):
    EARNED = "earned", "Earned"
    CLAIMED = "claimed", "Claimed"
    PROCESSING = "processing", "Processing"
    SHIPPED = "shipped", "Shipped"
    DELIVERED = "delivered", "Delivered"
    CANCELLED = "cancelled", "Cancelled"


class RewardDefinition(UUIDTimeStampedModel):
    class RewardType(models.TextChoices):
        MERCHANDISE = "merchandise", "Merchandise"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    reward_type = models.CharField(
        max_length=16, choices=RewardType.choices, default=RewardType.MERCHANDISE
    )
    required_streak = models.PositiveIntegerField()
    # The concrete realization of "inventory rules": this reward grants one
    # unit of this Product; the exact variant (size) is picked at claim time.
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="reward_definitions"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    terms = models.TextField(blank=True)

    # Reward protection: higher-value rewards can opt into stricter
    # eligibility gates. All off-by-default so existing tiers are
    # unaffected. Enforced in apps.rewards.services._check_reward_protection.
    require_email_verified = models.BooleanField(default=False)
    require_phone_verified = models.BooleanField(default=False)
    minimum_account_age_days = models.PositiveIntegerField(default=0)
    minimum_verified_checkins = models.PositiveIntegerField(default=0)
    block_if_high_risk_review = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=["status", "required_streak"])]

    def __str__(self):
        return f"{self.name} ({self.required_streak}-day streak)"


class UserReward(UUIDTimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="rewards")
    reward_definition = models.ForeignKey(
        RewardDefinition, on_delete=models.PROTECT, related_name="user_rewards"
    )
    earned_at = models.DateTimeField(default=timezone.now)
    claimed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=RewardStatus.choices, default=RewardStatus.EARNED
    )
    claim_code_hash = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        unique_together = ("user", "reward_definition")
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self):
        return f"{self.user_id} earned {self.reward_definition_id} ({self.status})"


class RewardClaim(UUIDTimeStampedModel):
    # At most one claim per UserReward, ever -- this is what makes
    # "duplicate request must not create two claims" a DB-enforced fact,
    # no client-supplied idempotency key needed.
    user_reward = models.OneToOneField(
        UserReward, on_delete=models.PROTECT, related_name="claim"
    )
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, related_name="claims")
    shipping_address = models.JSONField()
    tracking_number = models.CharField(max_length=100, blank=True, default="")
    carrier = models.CharField(max_length=100, blank=True, default="")
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    # Default CLAIMED (not PROCESSING): creation is a true 1:1 mirror with
    # UserReward.status at that moment. PROCESSING is a real, meaningful,
    # admin-driven transition afterward, not a value that exists for a
    # fraction of a transaction.
    status = models.CharField(
        max_length=16, choices=RewardStatus.choices, default=RewardStatus.CLAIMED
    )

    class Meta:
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"claim {self.id} ({self.status})"
