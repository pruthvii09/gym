from decimal import Decimal

from rest_framework import serializers

from apps.workouts.models import Exercise, ExerciseSet, SessionExercise, WorkoutSession


class ExerciseListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = (
            "id",
            "name",
            "category",
            "equipment",
            "level",
            "mechanic",
            "primary_muscles",
            "secondary_muscles",
        )
        read_only_fields = fields


class ExerciseDetailSerializer(ExerciseListSerializer):
    class Meta(ExerciseListSerializer.Meta):
        fields = ExerciseListSerializer.Meta.fields + ("instructions",)


class ExerciseSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseSet
        fields = ("id", "set_number", "reps", "weight_kg", "created_at")
        read_only_fields = fields


class AddSetSerializer(serializers.Serializer):
    reps = serializers.IntegerField(min_value=1)
    weight_kg = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )


class AddExerciseSerializer(serializers.Serializer):
    exercise_id = serializers.PrimaryKeyRelatedField(
        source="exercise", queryset=Exercise.objects.filter(is_active=True)
    )


class SessionExerciseSerializer(serializers.ModelSerializer):
    exercise = ExerciseListSerializer(read_only=True)
    sets = ExerciseSetSerializer(many=True, read_only=True)

    class Meta:
        model = SessionExercise
        fields = ("id", "exercise", "order", "sets")
        read_only_fields = fields


class WorkoutSessionListSerializer(serializers.ModelSerializer):
    """Summary shape for the history list -- exercise_count instead of the
    full nested exercises/sets, which WorkoutSessionDetailSerializer carries.
    """

    gym_name = serializers.CharField(source="gym.name", read_only=True)
    exercise_count = serializers.IntegerField(source="exercises.count", read_only=True)
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = WorkoutSession
        fields = (
            "id",
            "gym_name",
            "started_at",
            "ended_at",
            "status",
            "exercise_count",
            "duration_seconds",
        )
        read_only_fields = fields

    def get_duration_seconds(self, obj):
        if obj.ended_at is None:
            return None
        return int((obj.ended_at - obj.started_at).total_seconds())


class WorkoutSessionDetailSerializer(WorkoutSessionListSerializer):
    exercises = SessionExerciseSerializer(many=True, read_only=True)

    class Meta(WorkoutSessionListSerializer.Meta):
        fields = WorkoutSessionListSerializer.Meta.fields + ("exercises",)
