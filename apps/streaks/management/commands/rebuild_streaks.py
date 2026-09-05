from django.core.management.base import BaseCommand

from apps.checkins.models import CheckIn
from apps.streaks import services
from apps.users.models import User


class Command(BaseCommand):
    help = "Recompute UserStreak from verified CheckIn history."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-id",
            dest="user_id",
            default=None,
            help="Rebuild only this user's streak. Defaults to every user with "
            "at least one verified check-in.",
        )

    def handle(self, *args, **options):
        if options["user_id"]:
            users = User.objects.filter(pk=options["user_id"])
        else:
            users = User.objects.filter(checkins__status=CheckIn.Status.VERIFIED).distinct()

        count = 0
        for user in users:
            services.rebuild_user_streak(user)
            count += 1

        self.stdout.write(self.style.SUCCESS(f"Rebuilt {count} user streak(s)."))
