"""Business logic for the challenges app. Admin/operations-only in this
phase -- no member-facing evaluation logic exists yet (see Challenge's
docstring).
"""

from django.forms.models import model_to_dict

from apps.audit import services as audit_services
from apps.challenges.models import Challenge


def admin_create_challenge(*, actor, **fields):
    challenge = Challenge.objects.create(**fields)
    audit_services.record(
        actor=actor, action="challenge.create", entity=challenge, new_state=model_to_dict(challenge)
    )
    return challenge


def admin_update_challenge(*, actor, challenge, **fields):
    previous_state = model_to_dict(challenge)
    for field, value in fields.items():
        setattr(challenge, field, value)
    challenge.save()
    audit_services.record(
        actor=actor,
        action="challenge.update",
        entity=challenge,
        previous_state=previous_state,
        new_state=model_to_dict(challenge),
    )
    return challenge
