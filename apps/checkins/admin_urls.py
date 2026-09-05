from django.urls import path

from apps.checkins.admin_views import (
    AdminCheckInDetailView,
    AdminCheckInListView,
    AdminCheckInResolveView,
)

urlpatterns = [
    path("admin/checkins/", AdminCheckInListView.as_view(), name="admin-checkin-list"),
    path("admin/checkins/<uuid:pk>/", AdminCheckInDetailView.as_view(), name="admin-checkin-detail"),
    path(
        "admin/checkins/<uuid:pk>/resolve/",
        AdminCheckInResolveView.as_view(),
        name="admin-checkin-resolve",
    ),
]
