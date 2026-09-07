from django.urls import path

from apps.notifications.views import (
    MarkNotificationReadView,
    MyNotificationListView,
    PushSubscriptionView,
    UnreadNotificationCountView,
    VapidPublicKeyView,
)

urlpatterns = [
    path("me/notifications/", MyNotificationListView.as_view(), name="my-notification-list"),
    path(
        "me/notifications/unread-count/",
        UnreadNotificationCountView.as_view(),
        name="notification-unread-count",
    ),
    path(
        "me/notifications/<uuid:pk>/read/",
        MarkNotificationReadView.as_view(),
        name="notification-mark-read",
    ),
    path(
        "me/push-subscriptions/",
        PushSubscriptionView.as_view(),
        name="push-subscription",
    ),
    path("push/vapid-public-key/", VapidPublicKeyView.as_view(), name="vapid-public-key"),
]
