from django.urls import path

from apps.users.admin_views import (
    AdminUserBlockRewardClaimsView,
    AdminUserDetailView,
    AdminUserListView,
    AdminUserStatusUpdateView,
)

urlpatterns = [
    path("admin/users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("admin/users/<uuid:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path(
        "admin/users/<uuid:pk>/status/",
        AdminUserStatusUpdateView.as_view(),
        name="admin-user-status",
    ),
    path(
        "admin/users/<uuid:pk>/block-reward-claims/",
        AdminUserBlockRewardClaimsView.as_view(),
        name="admin-user-block-reward-claims",
    ),
]
