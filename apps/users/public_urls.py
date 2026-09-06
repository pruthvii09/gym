from django.urls import path

from apps.users.public_views import PublicProfileView, UserSearchView

urlpatterns = [
    # Must come before users/<str:username>/ -- both are plain string
    # segments (no UUID converter to naturally disambiguate, unlike e.g.
    # fraud-reviews/from-events/ vs. fraud-reviews/<uuid:pk>/), so
    # "search" would otherwise be captured as a literal username.
    path("users/search/", UserSearchView.as_view(), name="user-search"),
    path("users/<str:username>/", PublicProfileView.as_view(), name="public-profile"),
]
