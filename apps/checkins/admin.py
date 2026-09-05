from django.contrib import admin

from apps.checkins.models import CheckIn


@admin.register(CheckIn)
class CheckInAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "gym",
        "status",
        "verification_method",
        "risk_score",
        "checked_in_at",
        "created_at",
    )
    list_filter = ("status", "verification_method", "gym")
    search_fields = ("user__email", "gym__name", "idempotency_key")
    readonly_fields = [f.name for f in CheckIn._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
