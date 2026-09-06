from django.urls import path

from apps.analytics.views import MyAnalyticsView

urlpatterns = [
    path("me/analytics/", MyAnalyticsView.as_view(), name="my-analytics"),
]
