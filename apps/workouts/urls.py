from django.urls import path

from apps.workouts.views import (
    ExerciseDetailView,
    ExerciseListView,
    ExerciseSetCreateView,
    ExerciseSetDeleteView,
    SessionExerciseCreateView,
    WorkoutSessionCancelView,
    WorkoutSessionDetailView,
    WorkoutSessionFinishView,
    WorkoutSessionListCreateView,
)

urlpatterns = [
    path("exercises/", ExerciseListView.as_view(), name="exercise-list"),
    path("exercises/<uuid:pk>/", ExerciseDetailView.as_view(), name="exercise-detail"),
    path(
        "me/workouts/sessions/",
        WorkoutSessionListCreateView.as_view(),
        name="my-workout-session-list-create",
    ),
    path(
        "me/workouts/sessions/<uuid:pk>/",
        WorkoutSessionDetailView.as_view(),
        name="my-workout-session-detail",
    ),
    path(
        "me/workouts/sessions/<uuid:session_id>/exercises/",
        SessionExerciseCreateView.as_view(),
        name="my-workout-session-add-exercise",
    ),
    path(
        "me/workouts/sessions/<uuid:session_id>/exercises/<uuid:session_exercise_id>/sets/",
        ExerciseSetCreateView.as_view(),
        name="my-workout-session-add-set",
    ),
    path(
        "me/workouts/sessions/<uuid:session_id>/exercises/<uuid:session_exercise_id>/sets/<uuid:set_id>/",
        ExerciseSetDeleteView.as_view(),
        name="my-workout-session-delete-set",
    ),
    path(
        "me/workouts/sessions/<uuid:session_id>/finish/",
        WorkoutSessionFinishView.as_view(),
        name="my-workout-session-finish",
    ),
    path(
        "me/workouts/sessions/<uuid:session_id>/cancel/",
        WorkoutSessionCancelView.as_view(),
        name="my-workout-session-cancel",
    ),
]
