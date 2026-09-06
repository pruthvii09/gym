from rest_framework.response import Response
from rest_framework.views import APIView

from apps.badges import services
from apps.badges.serializers import (
    BadgeProgressSerializer,
    SetFeaturedBadgesSerializer,
    UserBadgeSerializer,
)


class MyBadgesView(APIView):
    """Every active badge paired with the current user's progress toward it
    (locked badges included, with a current/threshold progress value) --
    powers the "own profile" badge gallery.
    """

    def get(self, request):
        progress = services.badge_progress(request.user)
        return Response(BadgeProgressSerializer(progress, many=True).data)


class MyFeaturedBadgesView(APIView):
    """Set (replace) which of the user's own earned badges are featured on
    their public profile -- at most apps.badges.services.FEATURED_BADGE_LIMIT.
    """

    def put(self, request):
        serializer = SetFeaturedBadgesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        featured = services.set_featured(
            user=request.user,
            badge_ids=[str(bid) for bid in serializer.validated_data["badge_ids"]],
        )
        return Response(UserBadgeSerializer(featured, many=True).data)
