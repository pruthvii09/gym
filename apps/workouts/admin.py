from django.contrib import admin

from apps.workouts.models import Exercise, ExerciseSet, SessionExercise, WorkoutSession


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "equipment", "level", "is_active")
    list_filter = ("category", "equipment", "level", "is_active")
    search_fields = ("name", "external_id")


class SessionExerciseInline(admin.TabularInline):
    model = SessionExercise
    extra = 0
    readonly_fields = [f.name for f in SessionExercise._meta.fields]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(WorkoutSession)
class WorkoutSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "gym", "status", "started_at", "ended_at")
    list_filter = ("status", "gym")
    search_fields = ("user__email",)
    readonly_fields = [f.name for f in WorkoutSession._meta.fields]
    inlines = [SessionExerciseInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ExerciseSet)
class ExerciseSetAdmin(admin.ModelAdmin):
    list_display = ("session_exercise", "set_number", "reps", "weight_kg")
    readonly_fields = [f.name for f in ExerciseSet._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
