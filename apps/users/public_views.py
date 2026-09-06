from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView

from apps.users.models import User
from apps.users.public_serializers import PublicProfileSerializer, UserSearchResultSerializer

SEARCH_RESULT_LIMIT = 20


class UserSearchView(ListAPIView):
    """Any signed-in member can search for any other member by username or
    name -- platform-wide, not gym-scoped (this is the social/directory
    layer, distinct from gym-staff-only member lists). Never returns
    email/phone -- see UserSearchResultSerializer.
    """

    serializer_class = UserSearchResultSerializer
    # A flat, already-capped (SEARCH_RESULT_LIMIT) array, not a paginated
    # wrapper -- this is a lightweight typeahead-style lookup, not a
    # browsable list.
    pagination_class = None

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()
        if not query:
            return User.objects.none()

        return (
            User.objects.filter(is_active=True)
            .filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            )
            .order_by("username")[:SEARCH_RESULT_LIMIT]
        )


class PublicProfileView(RetrieveAPIView):
    """A member's public profile, looked up by username. IsAuthenticated
    (the default DRF permission) is enough -- any signed-in member can view
    any other member's profile, matching the platform-wide visibility the
    user asked for.
    """

    serializer_class = PublicProfileSerializer
    lookup_field = "username"

    def get_object(self):
        return get_object_or_404(User, username=self.kwargs["username"], is_active=True)
