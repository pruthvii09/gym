from django.urls import path

from apps.challenges.views import AdminChallengeDetailView, AdminChallengeListCreateView

urlpatterns = [
    path("admin/challenges/", AdminChallengeListCreateView.as_view(), name="admin-challenge-list-create"),
    path(
        "admin/challenges/<uuid:pk>/",
        AdminChallengeDetailView.as_view(),
        name="admin-challenge-detail",
    ),
]
