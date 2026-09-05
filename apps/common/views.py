import redis
from django.conf import settings
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Unauthenticated health check verifying DB and Redis connectivity."""

    permission_classes = [AllowAny]

    def get(self, request):
        components = {"database": "ok", "redis": "ok"}
        healthy = True

        try:
            connection.ensure_connection()
        except Exception:
            components["database"] = "error"
            healthy = False

        try:
            redis.from_url(settings.REDIS_URL).ping()
        except Exception:
            components["redis"] = "error"
            healthy = False

        status_code = 200 if healthy else 503
        return Response(
            {"status": "ok" if healthy else "error", **components},
            status=status_code,
        )
