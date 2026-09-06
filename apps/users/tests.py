import re

from django.core import mail
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.gyms.models import Gym
from apps.users.models import User


class AuthFlowTests(APITestCase):
    def setUp(self):
        self.credentials = {
            "email": "test@example.com",
            "username": "test_user",
            "password": "SuperSecret123!",
        }

    def tearDown(self):
        cache.clear()

    def test_register_login_refresh_me_flow(self):
        register_response = self.client.post("/api/v1/auth/register/", self.credentials)
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(register_response.data["email"], self.credentials["email"])

        login_response = self.client.post("/api/v1/auth/login/", self.credentials)
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        access = login_response.data["access"]
        refresh = login_response.data["refresh"]
        self.assertTrue(access)
        self.assertTrue(refresh)

        me_response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["email"], self.credentials["email"])
        self.assertFalse(me_response.data["is_staff"])

        refresh_response = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh})
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertTrue(refresh_response.data["access"])

    def test_register_with_gym_sets_membership_and_me_returns_it(self):
        gym = Gym.objects.create(
            name="Downtown Fitness",
            address="1 Main St",
            city="NYC",
            country="US",
            latitude="40.712800",
            longitude="-74.006000",
        )
        payload = {**self.credentials, "gym_id": str(gym.id)}
        register_response = self.client.post("/api/v1/auth/register/", payload)
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)

        login_response = self.client.post("/api/v1/auth/login/", self.credentials)
        access = login_response.data["access"]

        me_response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["gym"], {"id": str(gym.id), "name": gym.name})

    def test_register_without_gym_leaves_me_gym_null(self):
        register_response = self.client.post("/api/v1/auth/register/", self.credentials)
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)

        login_response = self.client.post("/api/v1/auth/login/", self.credentials)
        access = login_response.data["access"]

        me_response = self.client.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertIsNone(me_response.data["gym"])

    def test_admin_user_list_includes_gym(self):
        gym = Gym.objects.create(
            name="Downtown Fitness",
            address="1 Main St",
            city="NYC",
            country="US",
            latitude="40.712800",
            longitude="-74.006000",
        )
        self.client.post(
            "/api/v1/auth/register/", {**self.credentials, "gym_id": str(gym.id)}
        )
        staff = User.objects.create_user(
            email="staff@example.com", password="SuperSecret123!", is_staff=True
        )
        staff_login = self.client.post(
            "/api/v1/auth/login/", {"email": staff.email, "password": "SuperSecret123!"}
        )
        auth_header = {"HTTP_AUTHORIZATION": f"Bearer {staff_login.data['access']}"}

        response = self.client.get(
            f"/api/v1/admin/users/?search={self.credentials['email']}", **auth_header
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["gym"], {"id": str(gym.id), "name": gym.name})

    def test_duplicate_email_registration_rejected(self):
        self.client.post("/api/v1/auth/register/", self.credentials)
        response = self.client.post("/api/v1/auth/register/", self.credentials)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def _register_and_login(self):
        self.client.post("/api/v1/auth/register/", self.credentials)
        login_response = self.client.post("/api/v1/auth/login/", self.credentials)
        return login_response.data["access"], login_response.data["refresh"]

    def _extract_code(self, email_body):
        match = re.search(r"\b(\d{6})\b", email_body)
        self.assertIsNotNone(match, f"No 6-digit code found in email body: {email_body}")
        return match.group(1)

    def test_email_verification_flow(self):
        access, _ = self._register_and_login()
        auth_header = {"HTTP_AUTHORIZATION": f"Bearer {access}"}

        # captureOnCommitCallbacks: APITestCase wraps each test in a
        # transaction that's rolled back, not committed, so
        # transaction.on_commit() callbacks (which schedule the OTP email
        # task) never fire on their own -- this explicitly runs them.
        with self.captureOnCommitCallbacks(execute=True):
            send_response = self.client.post(
                "/api/v1/auth/email/send-verification/", **auth_header
            )
        self.assertEqual(send_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        code = self._extract_code(mail.outbox[0].body)

        verify_response = self.client.post(
            "/api/v1/auth/email/verify/", {"code": code}, **auth_header
        )
        self.assertEqual(verify_response.status_code, status.HTTP_200_OK)

        me_response = self.client.get("/api/v1/me/", **auth_header)
        self.assertTrue(me_response.data["email_verified"])

    def test_email_verify_wrong_code_rejected(self):
        access, _ = self._register_and_login()
        auth_header = {"HTTP_AUTHORIZATION": f"Bearer {access}"}
        self.client.post("/api/v1/auth/email/send-verification/", **auth_header)

        response = self.client.post(
            "/api/v1/auth/email/verify/", {"code": "000000"}, **auth_header
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_forgot_password_enumeration_safe(self):
        response = self.client.post(
            "/api/v1/auth/password/forgot/", {"email": "nobody@example.com"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_password_reset_flow(self):
        access, refresh = self._register_and_login()

        with self.captureOnCommitCallbacks(execute=True):
            forgot_response = self.client.post(
                "/api/v1/auth/password/forgot/", {"email": self.credentials["email"]}
            )
        self.assertEqual(forgot_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        code = self._extract_code(mail.outbox[0].body)

        new_password = "EvenSuperer456!"
        reset_response = self.client.post(
            "/api/v1/auth/password/reset/",
            {"email": self.credentials["email"], "code": code, "new_password": new_password},
        )
        self.assertEqual(reset_response.status_code, status.HTTP_200_OK)

        old_login = self.client.post("/api/v1/auth/login/", self.credentials)
        self.assertEqual(old_login.status_code, status.HTTP_401_UNAUTHORIZED)

        new_login = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.credentials["email"], "password": new_password},
        )
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

        refresh_response = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh})
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)


class UsernameTests(APITestCase):
    def setUp(self):
        self.credentials = {
            "email": "usernametest@example.com",
            "username": "username_test",
            "password": "SuperSecret123!",
        }

    def test_register_requires_username(self):
        response = self.client.post(
            "/api/v1/auth/register/", {"email": "nouser@example.com", "password": "SuperSecret123!"}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data["error"]["details"])

    def test_register_rejects_duplicate_username(self):
        self.client.post("/api/v1/auth/register/", self.credentials)
        response = self.client.post(
            "/api/v1/auth/register/",
            {**self.credentials, "email": "different@example.com"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_invalid_username_format(self):
        response = self.client.post(
            "/api/v1/auth/register/", {**self.credentials, "username": "Not A Valid Name!"}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_user_without_username_auto_generates_one(self):
        user = User.objects.create_user(email="autogen@example.com", password="SuperSecret123!")
        self.assertTrue(user.username)
        self.assertRegex(user.username, r"^[a-z0-9_]{3,30}$")

    def test_create_user_auto_generated_usernames_are_unique_on_collision(self):
        first = User.objects.create_user(email="samebase@example.com", password="SuperSecret123!")
        second = User.objects.create_user(email="samebase@other.com", password="SuperSecret123!")
        self.assertNotEqual(first.username, second.username)

    def test_me_can_update_own_username(self):
        self.client.post("/api/v1/auth/register/", self.credentials)
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.credentials["email"], "password": self.credentials["password"]},
        )
        auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.data['access']}"}

        response = self.client.patch(
            "/api/v1/me/", {"username": "new_username"}, format="json", **auth_header
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "new_username")


class PublicProfileTests(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(
            email="viewer@example.com", password="SuperSecret123!", username="viewer_one"
        )
        self.target = User.objects.create_user(
            email="target@example.com",
            password="SuperSecret123!",
            username="target_two",
            first_name="Target",
            last_name="User",
        )
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "viewer@example.com", "password": "SuperSecret123!"}
        )
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.data['access']}"}

    def test_public_profile_returns_non_pii_fields(self):
        response = self.client.get(f"/api/v1/users/{self.target.username}/", **self.auth_header)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "target_two")
        self.assertNotIn("email", response.data)
        self.assertNotIn("phone", response.data)
        self.assertNotIn("is_staff", response.data)

    def test_public_profile_404s_for_unknown_username(self):
        response = self.client.get("/api/v1/users/does-not-exist/", **self.auth_header)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_profile_requires_authentication(self):
        response = self.client.get(f"/api/v1/users/{self.target.username}/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_matches_username(self):
        response = self.client.get("/api/v1/users/search/?q=target", **self.auth_header)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [row["username"] for row in response.data]
        self.assertIn("target_two", usernames)

    def test_search_results_never_include_email_or_phone(self):
        response = self.client.get("/api/v1/users/search/?q=target", **self.auth_header)
        for row in response.data:
            self.assertNotIn("email", row)
            self.assertNotIn("phone", row)

    def test_search_without_query_returns_empty(self):
        response = self.client.get("/api/v1/users/search/", **self.auth_header)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
