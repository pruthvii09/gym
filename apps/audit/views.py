from rest_framework.generics import ListAPIView

from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.common.permissions import IsStaffUser


class AdminAuditLogListView(ListAPIView):
    """Read-only, admin-only. No write path exists on purpose -- an audit
    log that could be edited via the API it's supposed to be auditing isn't
    an audit log.
    """

    permission_classes = [IsStaffUser]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor").all()
        params = self.request.query_params

        entity_type = params.get("entity_type")
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)

        entity_id = params.get("entity_id")
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)

        action = params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        actor_id = params.get("actor")
        if actor_id:
            queryset = queryset.filter(actor_id=actor_id)

        return queryset
