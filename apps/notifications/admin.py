from django.contrib import admin

from apps.notifications.models import Notification, PushSubscription


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "title", "read_at", "created_at")
    list_filter = ("type",)
    search_fields = ("user__email", "title", "message")
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "user_agent", "created_at", "disabled_at")
    list_filter = ("disabled_at",)
    search_fields = ("user__email", "endpoint")
    readonly_fields = [f.name for f in PushSubscription._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
