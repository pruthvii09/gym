from django.urls import path

from apps.notifications.views import MarkNotificationReadView, MyNotificationListView

urlpatterns = [
    path("me/notifications/", MyNotificationListView.as_view(), name="my-notification-list"),
    path(
        "me/notifications/<uuid:pk>/read/",
        MarkNotificationReadView.as_view(),
        name="notification-mark-read",
    ),
]
