from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.users.views import MeView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", include("apps.common.urls")),
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/me/", MeView.as_view(), name="me"),
    path("api/v1/", include("apps.gyms.urls")),
    path("api/v1/", include("apps.checkins.urls")),
    path("api/v1/", include("apps.streaks.urls")),
    path("api/v1/", include("apps.rewards.urls")),
    path("api/v1/", include("apps.notifications.urls")),
    # Admin/operations API -- every endpoint under these is gated by
    # apps.common.permissions.IsStaffUser (User.is_staff), not just
    # IsAuthenticated. See API_CONTRACTS.md for the full admin surface.
    path("api/v1/", include("apps.users.admin_urls")),
    path("api/v1/", include("apps.gyms.admin_urls")),
    path("api/v1/", include("apps.checkins.admin_urls")),
    path("api/v1/", include("apps.streaks.admin_urls")),
    path("api/v1/", include("apps.fraud.admin_urls")),
    path("api/v1/", include("apps.rewards.admin_urls")),
    path("api/v1/", include("apps.challenges.admin_urls")),
    path("api/v1/", include("apps.audit.urls")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/v1/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/v1/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
]
