from django.contrib import admin

from apps.streaks import services
from apps.streaks.models import StreakPolicy, UserRestDay, UserStreak


@admin.register(UserStreak)
class UserStreakAdmin(admin.ModelAdmin):
    list_display = ("user", "current_streak", "longest_streak", "last_activity_date", "updated_at")
    search_fields = ("user__email",)
    readonly_fields = [f.name for f in UserStreak._meta.fields]
    actions = ["rebuild_selected"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.action(description="Rebuild selected streaks from verified check-ins")
    def rebuild_selected(self, request, queryset):
        for streak in queryset:
            services.rebuild_user_streak(streak.user)
        self.message_user(request, f"Rebuilt {queryset.count()} streak(s).")


@admin.register(UserRestDay)
class UserRestDayAdmin(admin.ModelAdmin):
    list_display = ("user", "day_of_week", "self_service_changes_used", "updated_at")
    search_fields = ("user__email",)
    readonly_fields = [f.name for f in UserRestDay._meta.fields]
    actions = ["reset_self_service_changes"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.action(description="Reset self-service change count to 0")
    def reset_self_service_changes(self, request, queryset):
        updated = queryset.update(self_service_changes_used=0)
        self.message_user(request, f"Reset {updated} rest-day change count(s).")


@admin.register(StreakPolicy)
class StreakPolicyAdmin(admin.ModelAdmin):
    list_display = (
        "minimum_days_per_week",
        "allowed_rest_days",
        "grace_period",
        "freeze_count",
        "updated_at",
    )
    readonly_fields = ("id", "created_at", "updated_at")

    def has_add_permission(self, request):
        return not StreakPolicy.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
