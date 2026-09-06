from django.urls import path

from apps.badges.views import MyBadgesView, MyFeaturedBadgesView

urlpatterns = [
    path("me/badges/", MyBadgesView.as_view(), name="my-badges"),
    path("me/badges/featured/", MyFeaturedBadgesView.as_view(), name="my-badges-featured"),
]
