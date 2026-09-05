from django.urls import path

from apps.fraud.admin_views import (
    AdminCreateReviewFromEventsView,
    AdminFraudEventListView,
    AdminFraudReviewDetailView,
    AdminFraudReviewListView,
    AdminFraudReviewResolveView,
)

urlpatterns = [
    path("admin/fraud-reviews/", AdminFraudReviewListView.as_view(), name="admin-fraud-review-list"),
    path(
        "admin/fraud-reviews/from-events/",
        AdminCreateReviewFromEventsView.as_view(),
        name="admin-fraud-review-from-events",
    ),
    path(
        "admin/fraud-reviews/<uuid:pk>/",
        AdminFraudReviewDetailView.as_view(),
        name="admin-fraud-review-detail",
    ),
    path(
        "admin/fraud-reviews/<uuid:pk>/resolve/",
        AdminFraudReviewResolveView.as_view(),
        name="admin-fraud-review-resolve",
    ),
    path("admin/fraud-events/", AdminFraudEventListView.as_view(), name="admin-fraud-event-list"),
]
