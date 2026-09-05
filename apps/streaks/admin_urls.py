from django.urls import path

from apps.streaks.admin_views import (
    AdminStreakPolicyView,
    AdminStreakRebuildAllView,
    AdminUserStreakDetailView,
    AdminUserStreakListView,
    AdminUserStreakRebuildView,
)

urlpatterns = [
    path("admin/streaks/", AdminUserStreakListView.as_view(), name="admin-streak-list"),
    path(
        "admin/streaks/<uuid:user_id>/",
        AdminUserStreakDetailView.as_view(),
        name="admin-streak-detail",
    ),
    path(
        "admin/streaks/<uuid:user_id>/rebuild/",
        AdminUserStreakRebuildView.as_view(),
        name="admin-streak-rebuild",
    ),
    path(
        "admin/streaks/rebuild-all/",
        AdminStreakRebuildAllView.as_view(),
        name="admin-streak-rebuild-all",
    ),
    path("admin/streak-policy/", AdminStreakPolicyView.as_view(), name="admin-streak-policy"),
]
