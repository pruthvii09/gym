from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.badges.serializers import UserBadgeSerializer
from apps.workouts import services
from apps.workouts.models import Exercise, ExerciseSet, SessionExercise, WorkoutSession
from apps.workouts.serializers import (
    AddExerciseSerializer,
    AddSetSerializer,
    ExerciseDetailSerializer,
    ExerciseListSerializer,
    ExerciseSetSerializer,
    SessionExerciseSerializer,
    WorkoutSessionDetailSerializer,
    WorkoutSessionListSerializer,
)


# --- Exercise catalog ---------------------------------------------------------


class ExerciseListView(ListAPIView):
    serializer_class = ExerciseListSerializer

    def get_queryset(self):
        queryset = Exercise.objects.filter(is_active=True).order_by("name")
        params = self.request.query_params

        search = params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        category = params.get("category")
        if category:
            queryset = queryset.filter(category__iexact=category)

        equipment = params.get("equipment")
        if equipment:
            queryset = queryset.filter(equipment__iexact=equipment)

        level = params.get("level")
        if level:
            queryset = queryset.filter(level__iexact=level)

        muscle = params.get("muscle")
        if muscle:
            # ArrayField's `contains` lookup is exact-membership, not
            # substring -- catalog values are lowercase single/hyphenated
            # words (see apps/workouts/data/exercises.json), so normalize
            # the input to match.
            muscle = muscle.lower()
            queryset = queryset.filter(primary_muscles__contains=[muscle]) | queryset.filter(
                secondary_muscles__contains=[muscle]
            )

        return queryset


class ExerciseDetailView(RetrieveAPIView):
    queryset = Exercise.objects.all()
    serializer_class = ExerciseDetailSerializer


# --- Member workout sessions --------------------------------------------------


class WorkoutSessionListCreateView(ListCreateAPIView):
    serializer_class = WorkoutSessionListSerializer

    def get_queryset(self):
        return services.get_member_workout_history(self.request.user)

    def create(self, request, *args, **kwargs):
        # No input serializer -- start_session takes only the user, the same
        # shape as CheckinCreateView's fully-server-derived outcome. Re-
        # serialize through the detail shape (empty exercises list) rather
        # than the list shape, so the client gets a shape it can render
        # straight into the active-session screen.
        session = services.start_session(request.user)
        return Response(WorkoutSessionDetailSerializer(session).data, status=201)


class WorkoutSessionDetailView(RetrieveAPIView):
    serializer_class = WorkoutSessionDetailSerializer

    def get_queryset(self):
        return services.get_member_workout_history(self.request.user)


def _get_own_session(request, session_id):
    return get_object_or_404(WorkoutSession, pk=session_id, user=request.user)


def _get_own_session_exercise(request, session_id, session_exercise_id):
    session = _get_own_session(request, session_id)
    return get_object_or_404(SessionExercise, pk=session_exercise_id, session=session)


class SessionExerciseCreateView(APIView):
    def post(self, request, session_id):
        session = _get_own_session(request, session_id)
        serializer = AddExerciseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_exercise = services.add_exercise(
            session=session, exercise=serializer.validated_data["exercise"]
        )
        return Response(SessionExerciseSerializer(session_exercise).data, status=201)


class ExerciseSetCreateView(APIView):
    def post(self, request, session_id, session_exercise_id):
        session_exercise = _get_own_session_exercise(request, session_id, session_exercise_id)
        serializer = AddSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exercise_set = services.add_set(session_exercise=session_exercise, **serializer.validated_data)
        return Response(ExerciseSetSerializer(exercise_set).data, status=201)


class ExerciseSetDeleteView(APIView):
    def delete(self, request, session_id, session_exercise_id, set_id):
        session_exercise = _get_own_session_exercise(request, session_id, session_exercise_id)
        exercise_set = get_object_or_404(
            ExerciseSet, pk=set_id, session_exercise=session_exercise
        )
        services.delete_set(session_exercise=session_exercise, exercise_set=exercise_set)
        return Response(status=204)


class WorkoutSessionFinishView(APIView):
    def post(self, request, session_id):
        session = _get_own_session(request, session_id)
        services.finish_session(session)
        data = {
            **WorkoutSessionDetailSerializer(session).data,
            "badges_unlocked": UserBadgeSerializer(
                getattr(session, "newly_earned_badges", []), many=True
            ).data,
        }
        return Response(data)


class WorkoutSessionCancelView(APIView):
    def post(self, request, session_id):
        session = _get_own_session(request, session_id)
        services.cancel_session(session)
        return Response(WorkoutSessionDetailSerializer(session).data)
