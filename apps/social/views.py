from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers import ActivityItemSerializer
from apps.users.models import User
from apps.users.public_serializers import UserSearchResultSerializer


def _get_target_user(username):
    return get_object_or_404(User, username=username, is_active=True)


class FollowView(APIView):
    """POST to follow, DELETE to unfollow -- one route for the toggle,
    matching apps.notifications.views.MarkNotificationReadView's shape of a
    small hand-rolled APIView for a single action.
    """

    def post(self, request, username):
        target = _get_target_user(username)
        follow, created = services.follow_user(follower=request.user, target=target)
        return Response(
            {"following": True, "created": created}, status=201 if created else 200
        )

    def delete(self, request, username):
        target = _get_target_user(username)
        services.unfollow_user(follower=request.user, target=target)
        return Response({"following": False})


class FollowerListView(ListAPIView):
    """Users who follow the given username -- traverses via Follow.follower's
    related_name ("following_links"): a User U shows up here iff one of U's
    following_links rows (Follow.follower=U) has following=target, i.e. U
    follows target.
    """

    serializer_class = UserSearchResultSerializer

    def get_queryset(self):
        target = _get_target_user(self.kwargs["username"])
        return User.objects.filter(following_links__following=target).order_by("username")


class FollowingListView(ListAPIView):
    """Users the given username follows -- mirror of FollowerListView via
    Follow.following's related_name ("follower_links").
    """

    serializer_class = UserSearchResultSerializer

    def get_queryset(self):
        target = _get_target_user(self.kwargs["username"])
        return User.objects.filter(follower_links__follower=target).order_by("username")


class MyFeedView(ListAPIView):
    serializer_class = ActivityItemSerializer

    def get_queryset(self):
        return services.get_feed(user=self.request.user)
