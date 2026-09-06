from django.db import migrations

# Kept in sync by hand -- migrations shouldn't import live model/service
# code, same reasoning as streaks/migrations/0002_seed_default_policy.py.
# A small, deliberately "fewer for now" starter set spanning every tier and
# most metrics; staff can add more later as plain Badge rows via the admin.
BADGES = [
    {
        "key": "first-steps",
        "name": "First Steps",
        "description": "Complete your first verified check-in.",
        "icon": "Footprints",
        "tier": "bronze",
        "metric": "total_checkins",
        "threshold": 1,
    },
    {
        "key": "week-warrior",
        "name": "Week Warrior",
        "description": "Reach a 7-day streak.",
        "icon": "Flame",
        "tier": "silver",
        "metric": "current_streak",
        "threshold": 7,
    },
    {
        "key": "iron-will",
        "name": "Iron Will",
        "description": "Reach a 30-day streak.",
        "icon": "Trophy",
        "tier": "gold",
        "metric": "current_streak",
        "threshold": 30,
    },
    {
        "key": "century-club",
        "name": "Century Club",
        "description": "Reach a 100-day streak.",
        "icon": "Crown",
        "tier": "platinum",
        "metric": "longest_streak",
        "threshold": 100,
    },
    {
        "key": "first-rep",
        "name": "First Rep",
        "description": "Log your first workout.",
        "icon": "Dumbbell",
        "tier": "bronze",
        "metric": "total_workouts",
        "threshold": 1,
    },
    {
        "key": "set-machine",
        "name": "Set Machine",
        "description": "Log 100 sets.",
        "icon": "Zap",
        "tier": "silver",
        "metric": "total_sets",
        "threshold": 100,
    },
    {
        "key": "collector",
        "name": "Collector",
        "description": "Earn your first reward.",
        "icon": "Gift",
        "tier": "bronze",
        "metric": "rewards_earned",
        "threshold": 1,
    },
]


def seed_badges(apps, schema_editor):
    Badge = apps.get_model("badges", "Badge")
    for fields in BADGES:
        Badge.objects.get_or_create(key=fields["key"], defaults=fields)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("badges", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_badges, noop_reverse),
    ]
