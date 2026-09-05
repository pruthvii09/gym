from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.checkins.models import CheckIn
from apps.gyms.models import Gym, GymMembership
from apps.users.models import User
from apps.workouts.models import Exercise, WorkoutSession

PASSWORD = "SuperSecret123!"

GYM_FIELDS = {
    "address": "1 Main St",
    "city": "NYC",
    "country": "US",
    "latitude": "40.712800",
    "longitude": "-74.006000",
}


class WorkoutsTestBase(APITestCase):
    def setUp(self):
        self.gym = Gym.objects.create(name="Downtown Fitness", **GYM_FIELDS)
        self.member = User.objects.create_user(email="member@example.com", password=PASSWORD)
        GymMembership.objects.create(user=self.member, gym=self.gym, role=GymMembership.Role.MEMBER)
        self.exercise = Exercise.objects.create(
            external_id="Barbell_Curl",
            name="Barbell Curl",
            category="strength",
            equipment="barbell",
            level="beginner",
            mechanic="isolation",
            primary_muscles=["biceps"],
            secondary_muscles=["forearms"],
            instructions=["Curl the bar."],
        )

    def verify_checkin_today(self, user=None, gym=None):
        return CheckIn.objects.create(
            user=user or self.member,
            gym=gym or self.gym,
            status=CheckIn.Status.VERIFIED,
            checked_in_at=timezone.now(),
            verification_method=CheckIn.VerificationMethod.MANUAL,
            latitude=self.gym.latitude,
            longitude=self.gym.longitude,
        )

    def auth_as(self, user):
        self.client.force_authenticate(user=user)


class ExerciseCatalogTests(WorkoutsTestBase):
    def test_list_requires_auth(self):
        response = self.client.get("/api/v1/exercises/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_and_filter(self):
        Exercise.objects.create(
            external_id="Treadmill_Run", name="Treadmill Run", category="cardio"
        )
        self.auth_as(self.member)

        response = self.client.get("/api/v1/exercises/?search=curl")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [row["name"] for row in response.data["results"]]
        self.assertIn("Barbell Curl", names)
        self.assertNotIn("Treadmill Run", names)

        response = self.client.get("/api/v1/exercises/?category=cardio")
        names = [row["name"] for row in response.data["results"]]
        self.assertEqual(names, ["Treadmill Run"])

        response = self.client.get("/api/v1/exercises/?muscle=biceps")
        names = [row["name"] for row in response.data["results"]]
        self.assertEqual(names, ["Barbell Curl"])

    def test_inactive_exercise_excluded_from_list(self):
        self.exercise.is_active = False
        self.exercise.save(update_fields=["is_active"])
        self.auth_as(self.member)
        response = self.client.get("/api/v1/exercises/")
        names = [row["name"] for row in response.data["results"]]
        self.assertNotIn("Barbell Curl", names)


class WorkoutSessionFlowTests(WorkoutsTestBase):
    def test_cannot_start_without_a_verified_checkin_today(self):
        self.auth_as(self.member)
        response = self.client.post("/api/v1/me/workouts/sessions/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(WorkoutSession.objects.exists())

    def test_full_session_flow(self):
        self.verify_checkin_today()
        self.auth_as(self.member)

        start = self.client.post("/api/v1/me/workouts/sessions/")
        self.assertEqual(start.status_code, status.HTTP_201_CREATED)
        self.assertEqual(start.data["status"], "active")
        session_id = start.data["id"]

        add_exercise = self.client.post(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/",
            {"exercise_id": str(self.exercise.id)},
        )
        self.assertEqual(add_exercise.status_code, status.HTTP_201_CREATED)
        session_exercise_id = add_exercise.data["id"]

        set1 = self.client.post(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/{session_exercise_id}/sets/",
            {"reps": 10, "weight_kg": "20.50"},
        )
        self.assertEqual(set1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set1.data["set_number"], 1)

        set2 = self.client.post(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/{session_exercise_id}/sets/",
            {"reps": 8},
        )
        self.assertEqual(set2.data["set_number"], 2)
        self.assertIsNone(set2.data["weight_kg"])

        finish = self.client.post(f"/api/v1/me/workouts/sessions/{session_id}/finish/")
        self.assertEqual(finish.status_code, status.HTTP_200_OK)
        self.assertEqual(finish.data["status"], "completed")
        self.assertIsNotNone(finish.data["duration_seconds"])
        self.assertEqual(len(finish.data["exercises"]), 1)
        self.assertEqual(len(finish.data["exercises"][0]["sets"]), 2)

        # Can't mutate a finished session.
        blocked = self.client.post(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/{session_exercise_id}/sets/",
            {"reps": 5},
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)

        history = self.client.get("/api/v1/me/workouts/sessions/")
        self.assertEqual(history.data["count"], 1)

    def test_only_one_active_session_at_a_time(self):
        self.verify_checkin_today()
        self.auth_as(self.member)
        first = self.client.post("/api/v1/me/workouts/sessions/")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post("/api/v1/me/workouts/sessions/")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_access_another_users_session(self):
        self.verify_checkin_today()
        self.auth_as(self.member)
        session_id = self.client.post("/api/v1/me/workouts/sessions/").data["id"]

        other = User.objects.create_user(email="other@example.com", password=PASSWORD)
        self.auth_as(other)
        response = self.client.get(f"/api/v1/me/workouts/sessions/{session_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_set(self):
        self.verify_checkin_today()
        self.auth_as(self.member)
        session_id = self.client.post("/api/v1/me/workouts/sessions/").data["id"]
        se_id = self.client.post(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/",
            {"exercise_id": str(self.exercise.id)},
        ).data["id"]
        set_id = self.client.post(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/{se_id}/sets/", {"reps": 10}
        ).data["id"]

        response = self.client.delete(
            f"/api/v1/me/workouts/sessions/{session_id}/exercises/{se_id}/sets/{set_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        detail = self.client.get(f"/api/v1/me/workouts/sessions/{session_id}/")
        self.assertEqual(detail.data["exercises"][0]["sets"], [])


class GymStaffWorkoutVisibilityTests(WorkoutsTestBase):
    def setUp(self):
        super().setUp()
        self.staff = User.objects.create_user(email="staff@example.com", password=PASSWORD)
        self.staff_membership = GymMembership.objects.create(
            user=self.staff, gym=self.gym, role=GymMembership.Role.STAFF
        )
        self.member_membership = GymMembership.objects.get(user=self.member, gym=self.gym)

    def test_staff_sees_member_workout_history_in_member_detail(self):
        checkin = self.verify_checkin_today()
        self.auth_as(self.member)
        session_id = self.client.post("/api/v1/me/workouts/sessions/").data["id"]
        self.client.post(f"/api/v1/me/workouts/sessions/{session_id}/finish/")

        self.auth_as(self.staff)
        response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/members/{self.member_membership.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["recent_workouts"]), 1)
        self.assertEqual(response.data["recent_workouts"][0]["id"], session_id)

    def test_non_staff_cannot_see_member_detail(self):
        self.verify_checkin_today()
        other_member = User.objects.create_user(email="other@example.com", password=PASSWORD)
        GymMembership.objects.create(user=other_member, gym=self.gym, role=GymMembership.Role.MEMBER)
        self.auth_as(other_member)
        response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/members/{self.member_membership.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
