from django.contrib import admin

from apps.streaks import services
from apps.streaks.models import StreakPolicy, UserStreak


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
