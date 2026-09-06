from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics import services
from apps.common.permissions import IsStaffUser


class AdminAnalyticsView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        range_param = request.query_params.get("range", "30d")
        return Response(services.get_platform_analytics(range_param))
