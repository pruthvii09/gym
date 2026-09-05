from django.urls import path

from apps.audit.views import AdminAuditLogListView

urlpatterns = [
    path("admin/audit-logs/", AdminAuditLogListView.as_view(), name="admin-audit-log-list"),
]
