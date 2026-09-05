"""Single write path for AuditLog. Every admin/operations service function
that mutates state calls `record()` -- never write an AuditLog row any other
way, so "what changed and who did it" is always reconstructable the same way.
"""

from apps.audit.models import AuditLog


def record(*, actor, action, entity, previous_state=None, new_state=None, reason=""):
    """`entity` is the model instance being changed -- its class name and pk
    become `entity_type`/`entity_id`. `actor` may be None for system-driven
    changes (e.g. a management command), never for an admin-API-driven one.
    """
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        entity_type=entity.__class__.__name__,
        entity_id=str(entity.pk),
        previous_state=previous_state,
        new_state=new_state,
        reason=reason,
    )
