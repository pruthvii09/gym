import re

from django.db import migrations

USERNAME_MAX_LENGTH = 30


def backfill_usernames(apps, schema_editor):
    """Duplicated from apps.users.managers.UserManager.generate_unique_username
    rather than imported -- migrations shouldn't depend on live model/manager
    code that can change shape later (same reasoning as
    streaks/migrations/0002_seed_default_policy.py). Ordered by created_at so
    a re-run against the same data is deterministic.
    """
    User = apps.get_model("users", "User")
    existing = set(User.objects.exclude(username__isnull=True).values_list("username", flat=True))

    for user in User.objects.filter(username__isnull=True).order_by("created_at"):
        seed = user.email.split("@")[0]
        base = re.sub(r"[^a-z0-9_]", "", seed.lower())[:USERNAME_MAX_LENGTH] or "user"
        if len(base) < 3:
            base = base.ljust(3, "0")
        candidate = base
        suffix = 1
        while candidate in existing:
            suffix += 1
            suffix_str = str(suffix)
            candidate = f"{base[: USERNAME_MAX_LENGTH - len(suffix_str)]}{suffix_str}"
        existing.add(candidate)
        user.username = candidate
        user.save(update_fields=["username"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_add_username"),
    ]

    operations = [
        migrations.RunPython(backfill_usernames, noop_reverse),
    ]
