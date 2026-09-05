from django.urls import path

from apps.gyms.admin_views import (
    AdminGymApproveView,
    AdminGymCheckinDeviceDetailView,
    AdminGymCheckinDeviceListView,
    AdminGymCheckinDeviceStatusUpdateView,
    AdminGymDetailView,
    AdminGymListCreateView,
    AdminGymMembershipListCreateView,
    AdminGymRejectView,
)

urlpatterns = [
    path("admin/gyms/", AdminGymListCreateView.as_view(), name="admin-gym-list-create"),
    path("admin/gyms/<uuid:pk>/", AdminGymDetailView.as_view(), name="admin-gym-detail"),
    path(
        "admin/gyms/<uuid:pk>/approve/",
        AdminGymApproveView.as_view(),
        name="admin-gym-approve",
    ),
    path(
        "admin/gyms/<uuid:pk>/reject/",
        AdminGymRejectView.as_view(),
        name="admin-gym-reject",
    ),
    path(
        "admin/gym-memberships/",
        AdminGymMembershipListCreateView.as_view(),
        name="admin-gym-membership-list-create",
    ),
    path(
        "admin/gym-devices/",
        AdminGymCheckinDeviceListView.as_view(),
        name="admin-gym-device-list",
    ),
    path(
        "admin/gym-devices/<uuid:pk>/",
        AdminGymCheckinDeviceDetailView.as_view(),
        name="admin-gym-device-detail",
    ),
    path(
        "admin/gym-devices/<uuid:pk>/status/",
        AdminGymCheckinDeviceStatusUpdateView.as_view(),
        name="admin-gym-device-status",
    ),
]
