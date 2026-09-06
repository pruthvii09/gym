from django.contrib import admin

from apps.social.models import ActivityItem, Follow


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "following", "created_at")
    search_fields = ("follower__email", "follower__username", "following__email", "following__username")
    readonly_fields = [f.name for f in Follow._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ActivityItem)
class ActivityItemAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "value", "created_at")
    list_filter = ("type",)
    search_fields = ("user__email", "user__username")
    readonly_fields = [f.name for f in ActivityItem._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
