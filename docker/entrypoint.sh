#!/bin/sh
set -e

# Only one service (web) runs migrations/bootstrap, so celery worker/beat
# starting in parallel don't race each other applying DDL concurrently.
if [ "$RUN_MIGRATIONS" = "true" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput
  # Idempotent (upserts by external_id) -- safe to run on every deploy, not
  # just once, so a future update to the vendored dataset just re-seeds.
  python manage.py seed_exercises

  if [ -n "$DJANGO_SUPERUSER_EMAIL" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
    python manage.py shell -c "
from apps.users.models import User
if not User.objects.filter(email='$DJANGO_SUPERUSER_EMAIL').exists():
    User.objects.create_superuser('$DJANGO_SUPERUSER_EMAIL', '$DJANGO_SUPERUSER_PASSWORD')
"
  fi
fi

exec "$@"
