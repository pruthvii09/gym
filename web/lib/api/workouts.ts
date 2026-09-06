import { apiFetch } from "@/lib/api/client";
import type {
  AddSetRequest,
  Exercise,
  ExerciseDetail,
  ExerciseSet,
  FinishWorkoutSessionResult,
  PaginatedResponse,
  SessionExercise,
  WorkoutSessionDetail,
  WorkoutSessionSummary,
} from "@/types/api";

export interface ExerciseFilters {
  search?: string;
  category?: string;
  equipment?: string;
  muscle?: string;
  level?: string;
  page?: number;
}

export function listExercises(filters: ExerciseFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<PaginatedResponse<Exercise>>(
    `/api/v1/exercises/${query ? `?${query}` : ""}`,
    {},
    { auth: true }
  );
}

export function getExercise(id: string) {
  return apiFetch<ExerciseDetail>(`/api/v1/exercises/${id}/`, {}, { auth: true });
}

export function listMyWorkoutSessions(page = 1) {
  return apiFetch<PaginatedResponse<WorkoutSessionSummary>>(
    `/api/v1/me/workouts/sessions/?page=${page}`,
    {},
    { auth: true }
  );
}

export function startWorkoutSession() {
  return apiFetch<WorkoutSessionDetail>(
    "/api/v1/me/workouts/sessions/",
    { method: "POST" },
    { auth: true }
  );
}

export function getWorkoutSession(id: string) {
  return apiFetch<WorkoutSessionDetail>(
    `/api/v1/me/workouts/sessions/${id}/`,
    {},
    { auth: true }
  );
}

export function addSessionExercise(sessionId: string, exerciseId: string) {
  return apiFetch<SessionExercise>(
    `/api/v1/me/workouts/sessions/${sessionId}/exercises/`,
    { method: "POST", body: JSON.stringify({ exercise_id: exerciseId }) },
    { auth: true }
  );
}

export function addExerciseSet(
  sessionId: string,
  sessionExerciseId: string,
  payload: AddSetRequest
) {
  return apiFetch<ExerciseSet>(
    `/api/v1/me/workouts/sessions/${sessionId}/exercises/${sessionExerciseId}/sets/`,
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}

export function deleteExerciseSet(
  sessionId: string,
  sessionExerciseId: string,
  setId: string
) {
  return apiFetch<undefined>(
    `/api/v1/me/workouts/sessions/${sessionId}/exercises/${sessionExerciseId}/sets/${setId}/`,
    { method: "DELETE" },
    { auth: true }
  );
}

export function finishWorkoutSession(id: string) {
  return apiFetch<FinishWorkoutSessionResult>(
    `/api/v1/me/workouts/sessions/${id}/finish/`,
    { method: "POST" },
    { auth: true }
  );
}

export function cancelWorkoutSession(id: string) {
  return apiFetch<WorkoutSessionDetail>(
    `/api/v1/me/workouts/sessions/${id}/cancel/`,
    { method: "POST" },
    { auth: true }
  );
}
