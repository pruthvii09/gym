from django.urls import path

from apps.social.views import FollowerListView, FollowingListView, FollowView, MyFeedView

urlpatterns = [
    path("me/feed/", MyFeedView.as_view(), name="my-feed"),
    path("users/<str:username>/follow/", FollowView.as_view(), name="user-follow"),
    path("users/<str:username>/followers/", FollowerListView.as_view(), name="user-followers"),
    path("users/<str:username>/following/", FollowingListView.as_view(), name="user-following"),
]
