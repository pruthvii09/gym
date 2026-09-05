from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.models import User


class Exercise(UUIDTimeStampedModel):
    """The public exercise catalog -- seeded once from a vendored public
    dataset (apps/workouts/data/exercises.json, see
    management/commands/seed_exercises.py), not fetched live. external_id
    is the seed dataset's own stable slug, used as the idempotency key for
    re-seeding.
    """

    external_id = models.SlugField(unique=True, max_length=128)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=32)
    equipment = models.CharField(max_length=64, blank=True)
    level = models.CharField(max_length=16, blank=True)
    mechanic = models.CharField(max_length=16, blank=True)
    primary_muscles = ArrayField(models.CharField(max_length=32), default=list, blank=True)
    secondary_muscles = ArrayField(models.CharField(max_length=32), default=list, blank=True)
    instructions = models.JSONField(default=list, blank=True)
    # Platform-staff-only toggle for hiding a bad catalog entry -- never
    # deleted, since past WorkoutSessions may already reference it
    # (on_delete=PROTECT below).
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.name


class WorkoutSession(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workout_sessions")
    # The check-in that authorized starting this session (see
    # services.start_session) -- audit trail, and what gym-staff visibility
    # is scoped through.
    checkin = models.ForeignKey(
        "checkins.CheckIn", on_delete=models.PROTECT, related_name="workout_sessions"
    )
    # Denormalized from checkin.gym -- same reasoning CheckIn itself stores
    # gym directly rather than requiring a join through session/device.
    gym = models.ForeignKey("gyms.Gym", on_delete=models.PROTECT, related_name="workout_sessions")
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["gym", "started_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} workout ({self.status})"


class SessionExercise(UUIDTimeStampedModel):
    session = models.ForeignKey(WorkoutSession, on_delete=models.CASCADE, related_name="exercises")
    exercise = models.ForeignKey(
        Exercise, on_delete=models.PROTECT, related_name="session_exercises"
    )
    # Sequence in which exercises were added to the session -- display order.
    order = models.PositiveIntegerField()

    class Meta:
        indexes = [models.Index(fields=["session", "order"])]

    def __str__(self):
        return f"{self.exercise.name} in session {self.session_id}"


class ExerciseSet(UUIDTimeStampedModel):
    session_exercise = models.ForeignKey(
        SessionExercise, on_delete=models.CASCADE, related_name="sets"
    )
    set_number = models.PositiveIntegerField()
    reps = models.PositiveIntegerField()
    # Null for bodyweight exercises with no external load.
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["session_exercise", "set_number"])]

    def __str__(self):
        return f"set {self.set_number}: {self.reps} reps"
