from django.contrib import admin

from apps.challenges.models import Challenge


@admin.register(Challenge)
class ChallengeAdmin(admin.ModelAdmin):
    list_display = ("name", "status", "start_date", "end_date", "reward_definition", "created_at")
    list_filter = ("status",)
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")
