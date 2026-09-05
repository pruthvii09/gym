from django.contrib import admin, messages
from rest_framework.exceptions import ValidationError

from apps.rewards import services
from apps.rewards.models import (
    InventoryTransaction,
    Product,
    ProductVariant,
    RewardClaim,
    RewardDefinition,
    RewardStatus,
    UserReward,
)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "type", "status", "created_at")
    list_filter = ("status", "type")
    search_fields = ("name", "sku")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ("product", "size", "stock", "updated_at")
    list_filter = ("product",)
    search_fields = ("product__name", "product__sku", "size")
    readonly_fields = ("id", "stock", "created_at", "updated_at")
    actions = ["rebuild_stock"]

    @admin.action(description="Rebuild stock from the InventoryTransaction ledger")
    def rebuild_stock(self, request, queryset):
        for variant in queryset:
            services.rebuild_variant_stock(variant)
        self.message_user(request, f"Rebuilt stock for {queryset.count()} variant(s).")


@admin.register(RewardDefinition)
class RewardDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "required_streak", "product", "status", "created_at")
    list_filter = ("status", "reward_type")
    search_fields = ("name", "product__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(UserReward)
class UserRewardAdmin(admin.ModelAdmin):
    list_display = ("user", "reward_definition", "status", "earned_at", "claimed_at")
    list_filter = ("status",)
    search_fields = ("user__email", "reward_definition__name")
    readonly_fields = [f.name for f in UserReward._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(InventoryTransaction)
class InventoryTransactionAdmin(admin.ModelAdmin):
    list_display = ("variant", "type", "quantity", "reference", "created_at")
    list_filter = ("type",)
    search_fields = ("variant__product__name", "reference")
    readonly_fields = [f.name for f in InventoryTransaction._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(RewardClaim)
class RewardClaimAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user_reward",
        "variant",
        "status",
        "tracking_number",
        "carrier",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("id", "tracking_number", "user_reward__user__email")
    readonly_fields = [
        f.name
        for f in RewardClaim._meta.fields
        if f.name not in ("status", "tracking_number", "carrier")
    ]
    actions = ["cancel_selected"]

    def save_model(self, request, obj, form, change):
        if change and "status" in form.changed_data:
            # Reload the pre-edit row: the service validates the transition
            # against the OLD status, and re-derives tracking_number/carrier
            # from what the form actually changed rather than trusting
            # `obj`, which the ModelForm has already mutated in place.
            current = RewardClaim.objects.get(pk=obj.pk)
            try:
                services.transition_claim_status(
                    actor=request.user,
                    claim=current,
                    new_status=obj.status,
                    tracking_number=obj.tracking_number if "tracking_number" in form.changed_data else None,
                    carrier=obj.carrier if "carrier" in form.changed_data else None,
                )
            except ValidationError as exc:
                self.message_user(request, str(exc.detail[0]), level=messages.ERROR)
            return

        super().save_model(request, obj, form, change)
        services.sync_user_reward_status(obj)

    @admin.action(description="Cancel selected claims (releases inventory)")
    def cancel_selected(self, request, queryset):
        cancelled = 0
        for claim in queryset.exclude(status=RewardStatus.CANCELLED):
            try:
                services.transition_claim_status(
                    actor=request.user,
                    claim=claim,
                    new_status=RewardStatus.CANCELLED,
                    reason="Cancelled via admin bulk action",
                )
                cancelled += 1
            except ValidationError as exc:
                self.message_user(
                    request, f"{claim.id}: {exc.detail[0]}", level=messages.WARNING
                )
        self.message_user(request, f"Cancelled {cancelled} claim(s).")
