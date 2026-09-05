from django.db import migrations

# Kept in sync by hand with apps.streaks.services.DEFAULT_POLICY -- migrations
# shouldn't import live model/service code, so these are duplicated literals.
DEFAULTS = {
    "minimum_days_per_week": 2,
    "allowed_rest_days": 1,
    "grace_period": 120,
    "freeze_count": 2,
}


def seed_default_policy(apps, schema_editor):
    StreakPolicy = apps.get_model("streaks", "StreakPolicy")
    if not StreakPolicy.objects.exists():
        StreakPolicy.objects.create(**DEFAULTS)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("streaks", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_default_policy, noop_reverse),
    ]
