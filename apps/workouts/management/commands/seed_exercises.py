import json
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.workouts.models import Exercise

DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "exercises.json"


class Command(BaseCommand):
    help = (
        "Seed the exercise catalog from the vendored dataset "
        "(apps/workouts/data/exercises.json). Idempotent: safe to re-run "
        "after updating the vendored file -- upserts by external_id."
    )

    def handle(self, *args, **options):
        with open(DATA_PATH) as f:
            rows = json.load(f)

        created = 0
        updated = 0
        for row in rows:
            _, was_created = Exercise.objects.update_or_create(
                external_id=row["external_id"],
                defaults={
                    "name": row["name"],
                    "category": row["category"],
                    "equipment": row["equipment"],
                    "level": row["level"],
                    "mechanic": row["mechanic"],
                    "primary_muscles": row["primary_muscles"],
                    "secondary_muscles": row["secondary_muscles"],
                    "instructions": row["instructions"],
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"Seeded exercises: {created} created, {updated} updated.")
        )
