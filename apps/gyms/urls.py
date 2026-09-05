from django.urls import path

from apps.gyms.views import (
    GymCheckinDeviceCreateView,
    GymCheckinDeviceQrView,
    GymCheckinDeviceRotateView,
    GymDetailView,
    GymDeviceListView,
    GymListView,
    GymMemberDetailView,
    GymMemberListView,
    GymMemberRestDayView,
    GymStaffDetailView,
    GymStaffInviteAcceptView,
    GymStaffInviteListCreateView,
    GymStaffInvitePreviewView,
    GymStaffInviteRevokeView,
    GymStaffListView,
    MyGymMembershipsView,
)

urlpatterns = [
    path("gyms/", GymListView.as_view(), name="gym-list"),
    path("gyms/<uuid:pk>/", GymDetailView.as_view(), name="gym-detail"),
    path("gyms/<uuid:pk>/members/", GymMemberListView.as_view(), name="gym-member-list"),
    path(
        "gyms/<uuid:pk>/members/<uuid:membership_id>/",
        GymMemberDetailView.as_view(),
        name="gym-member-detail",
    ),
    path(
        "gyms/<uuid:pk>/members/<uuid:membership_id>/rest-day/",
        GymMemberRestDayView.as_view(),
        name="gym-member-rest-day",
    ),
    path("gyms/<uuid:pk>/devices/", GymDeviceListView.as_view(), name="gym-device-list"),
    path("gyms/<uuid:pk>/staff/", GymStaffListView.as_view(), name="gym-staff-list"),
    path(
        "gyms/<uuid:pk>/staff/<uuid:membership_id>/",
        GymStaffDetailView.as_view(),
        name="gym-staff-detail",
    ),
    path(
        "gyms/<uuid:pk>/staff-invites/",
        GymStaffInviteListCreateView.as_view(),
        name="gym-staff-invite-list-create",
    ),
    path(
        "gyms/<uuid:pk>/staff-invites/<uuid:invite_id>/revoke/",
        GymStaffInviteRevokeView.as_view(),
        name="gym-staff-invite-revoke",
    ),
    path(
        "staff-invites/<str:token>/",
        GymStaffInvitePreviewView.as_view(),
        name="gym-staff-invite-preview",
    ),
    path(
        "staff-invites/<str:token>/accept/",
        GymStaffInviteAcceptView.as_view(),
        name="gym-staff-invite-accept",
    ),
    path("me/gym-memberships/", MyGymMembershipsView.as_view(), name="my-gym-memberships"),
    path("gym-devices/", GymCheckinDeviceCreateView.as_view(), name="gym-device-create"),
    path(
        "gym-devices/<uuid:pk>/rotate/",
        GymCheckinDeviceRotateView.as_view(),
        name="gym-device-rotate",
    ),
    path("gym-devices/<uuid:pk>/qr/", GymCheckinDeviceQrView.as_view(), name="gym-device-qr"),
]
