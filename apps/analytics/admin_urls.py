from django.urls import path

from apps.analytics.admin_views import AdminAnalyticsView

urlpatterns = [
    path("admin/analytics/", AdminAnalyticsView.as_view(), name="admin-analytics"),
]
