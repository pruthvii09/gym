from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics import services


class MyAnalyticsView(APIView):
    def get(self, request):
        range_param = request.query_params.get("range", "30d")
        return Response(services.get_member_analytics(request.user, range_param))
