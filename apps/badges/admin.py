from django.contrib import admin

from apps.badges.models import Badge, UserBadge


@admin.register(Badge)
class BadgeAdmin(admin.ModelAdmin):
    """Fully editable -- staff can add a new badge as a data row (name,
    description, icon, tier, metric, threshold) with no deploy, same as
    RewardDefinition.
    """

    list_display = ("name", "tier", "metric", "threshold", "is_active")
    list_filter = ("tier", "metric", "is_active")
    search_fields = ("name", "key")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(UserBadge)
class UserBadgeAdmin(admin.ModelAdmin):
    list_display = ("user", "badge", "earned_at", "is_featured")
    list_filter = ("is_featured", "badge")
    search_fields = ("user__email", "badge__name")
    readonly_fields = [f.name for f in UserBadge._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
