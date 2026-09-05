from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.users.models import OTP, User, UserDevice


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = (
        "email",
        "first_name",
        "last_name",
        "email_verified",
        "phone_verified",
        "is_staff",
        "is_active",
        "created_at",
    )
    search_fields = ("email", "first_name", "last_name", "phone")
    readonly_fields = ("id", "created_at", "updated_at", "last_login")
    actions = ["block_reward_claims"]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone")}),
        (
            "Verification",
            {"fields": ("email_verified", "phone_verified")},
        ),
        (
            "Permissions",
            {
                "fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions"),
                "description": "Unchecking 'Active' suspends the user: they're immediately "
                "locked out of every authenticated endpoint, even with a still-valid access "
                "token. Re-check to restore.",
            },
        ),
        ("Important dates", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2"),
            },
        ),
    )

    @admin.action(description="Block reward claims for selected users (opens HIGH fraud review)")
    def block_reward_claims(self, request, queryset):
        from apps.fraud.services import block_reward_claims

        for user in queryset:
            review = block_reward_claims(actor=request.user, user=user)
            self.log_change(request, user, f"Blocked reward claims (FraudReview {review.id}).")
        self.message_user(request, "Blocked reward claims for selected user(s).")


@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "destination", "expires_at", "attempts", "consumed_at", "created_at")
    list_filter = ("purpose",)
    search_fields = ("user__email", "destination")
    readonly_fields = [f.name for f in OTP._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(UserDevice)
class UserDeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "device_hash", "platform", "trusted", "first_seen_at", "last_seen_at")
    list_filter = ("platform", "trusted")
    search_fields = ("user__email", "device_hash")
    readonly_fields = [f.name for f in UserDevice._meta.fields if f.name != "trusted"]

    def has_add_permission(self, request):
        return False
