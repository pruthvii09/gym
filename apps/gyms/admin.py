from django.contrib import admin
from rest_framework.exceptions import ValidationError

from apps.gyms import services
from apps.gyms.models import (
    CheckinSession,
    Gym,
    GymCheckinDevice,
    GymMembership,
    GymStaffInvite,
)


@admin.register(Gym)
class GymAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "country", "status", "checkin_radius_meters", "created_at")
    list_filter = ("status", "country")
    search_fields = ("name", "city", "country")
    readonly_fields = ("id", "created_at", "updated_at")
    actions = ["approve_gyms", "reject_gyms"]

    @admin.action(description="Approve selected pending gyms")
    def approve_gyms(self, request, queryset):
        approved = 0
        for gym in queryset:
            try:
                services.admin_approve_gym(actor=request.user, gym=gym)
                approved += 1
            except ValidationError:
                continue
        skipped = queryset.count() - approved
        self.message_user(
            request,
            f"Approved {approved} gym(s)."
            + (f" Skipped {skipped} not pending." if skipped else ""),
        )

    @admin.action(description="Reject selected pending gyms")
    def reject_gyms(self, request, queryset):
        rejected = 0
        for gym in queryset:
            try:
                services.admin_reject_gym(actor=request.user, gym=gym)
                rejected += 1
            except ValidationError:
                continue
        skipped = queryset.count() - rejected
        self.message_user(
            request,
            f"Rejected {rejected} gym(s)."
            + (f" Skipped {skipped} not pending." if skipped else ""),
        )


@admin.register(GymMembership)
class GymMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "gym", "role", "status", "created_at")
    list_filter = ("role", "status")
    search_fields = ("user__email", "gym__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(GymCheckinDevice)
class GymCheckinDeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "gym", "device_code", "status", "last_rotation_at", "created_at")
    list_filter = ("status", "gym")
    search_fields = ("name", "device_code", "gym__name")
    readonly_fields = [f.name for f in GymCheckinDevice._meta.fields if f.name != "status"]

    def has_add_permission(self, request):
        return False


@admin.register(GymStaffInvite)
class GymStaffInviteAdmin(admin.ModelAdmin):
    list_display = ("email", "gym", "role", "status", "invited_by", "expires_at", "created_at")
    list_filter = ("status", "role", "gym")
    search_fields = ("email", "gym__name")
    readonly_fields = [f.name for f in GymStaffInvite._meta.fields if f.name != "status"]

    def has_add_permission(self, request):
        # Created only via services.invite_gym_staff (needs a raw token to
        # email) -- same reasoning as GymCheckinDeviceAdmin.
        return False


@admin.register(CheckinSession)
class CheckinSessionAdmin(admin.ModelAdmin):
    list_display = ("gym", "device", "status", "expires_at", "created_at", "updated_at")
    list_filter = ("status", "gym")
    search_fields = ("gym__name", "device__name", "token_hash")
    readonly_fields = [f.name for f in CheckinSession._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
