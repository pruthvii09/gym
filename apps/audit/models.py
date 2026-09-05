from django.core.serializers.json import DjangoJSONEncoder
from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class AuditLog(UUIDTimeStampedModel):
    """Append-only record of every admin/operations mutation in the system.

    Never updated or deleted once written -- `created_at` (from the base
    model) IS the event timestamp. `actor` is nullable to allow for
    system-initiated changes (e.g. a management command) that have no
    requesting admin user.
    """

    actor = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    # DjangoJSONEncoder: previous/new state snapshots come from
    # model_to_dict() on arbitrary models, which can include UUID, Decimal,
    # and datetime values that plain json.JSONEncoder can't serialize.
    previous_state = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    new_state = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
            models.Index(fields=["actor", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action} on {self.entity_type}:{self.entity_id}"
