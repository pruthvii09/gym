import uuid

from django.db import models


class UUIDTimeStampedModel(models.Model):
    """Abstract base model for every concrete model in the project.

    UUID is the primary key itself (no separate public-id field), plus
    created_at/updated_at timestamps.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
