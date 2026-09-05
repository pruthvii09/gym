import re

from django.core import mail
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.gyms.models import Gym, GymMembership
from apps.users.models import User

PASSWORD = "SuperSecret123!"

GYM_FIELDS = {
    "address": "1 Main St",
    "city": "NYC",
    "country": "US",
    "latitude": "40.712800",
    "longitude": "-74.006000",
}


class PublicGymDirectoryTests(APITestCase):
    def setUp(self):
        self.gym = Gym.objects.create(
            name="Downtown Fitness",
            address="1 Main St",
            city="NYC",
            country="US",
            latitude="40.712800",
            longitude="-74.006000",
        )

    def test_list_gyms_requires_no_auth(self):
        response = self.client.get("/api/v1/gyms/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(str(self.gym.id), ids)

    def test_retrieve_gym_requires_no_auth(self):
        response = self.client.get(f"/api/v1/gyms/{self.gym.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], self.gym.name)

    def test_inactive_gym_not_retrievable(self):
        self.gym.status = Gym.Status.INACTIVE
        self.gym.save(update_fields=["status"])
        response = self.client.get(f"/api/v1/gyms/{self.gym.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class GymApprovalWorkflowTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.com", password=PASSWORD)
        self.staff = User.objects.create_user(
            email="staff@example.com", password=PASSWORD, is_staff=True
        )

    def tearDown(self):
        # Each test logs in at least once; clear the login throttle's cache
        # between tests so they don't cumulatively trip the 10/min scope.
        cache.clear()

    def _auth_header(self, email):
        response = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": PASSWORD}
        )
        return {"HTTP_AUTHORIZATION": f"Bearer {response.data['access']}"}

    def _create_pending_gym(self):
        response = self.client.post(
            "/api/v1/gyms/",
            {"name": "New Gym", **GYM_FIELDS},
            **self._auth_header(self.owner.email),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data["id"]

    def test_self_service_gym_starts_pending_and_hidden(self):
        gym_id = self._create_pending_gym()
        gym = Gym.objects.get(id=gym_id)
        self.assertEqual(gym.status, Gym.Status.PENDING)

        list_response = self.client.get("/api/v1/gyms/")
        ids = [row["id"] for row in list_response.data["results"]]
        self.assertNotIn(gym_id, ids)

        detail_response = self.client.get(f"/api/v1/gyms/{gym_id}/")
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_can_approve_pending_gym(self):
        gym_id = self._create_pending_gym()
        response = self.client.post(
            f"/api/v1/admin/gyms/{gym_id}/approve/", **self._auth_header(self.staff.email)
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "active")

        list_response = self.client.get("/api/v1/gyms/")
        ids = [row["id"] for row in list_response.data["results"]]
        self.assertIn(gym_id, ids)

    def test_staff_can_reject_pending_gym(self):
        gym_id = self._create_pending_gym()
        response = self.client.post(
            f"/api/v1/admin/gyms/{gym_id}/reject/",
            {"reason": "Duplicate listing"},
            **self._auth_header(self.staff.email),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "rejected")

        detail_response = self.client.get(f"/api/v1/gyms/{gym_id}/")
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_staff_cannot_approve_or_reject(self):
        gym_id = self._create_pending_gym()
        approve_response = self.client.post(
            f"/api/v1/admin/gyms/{gym_id}/approve/", **self._auth_header(self.owner.email)
        )
        self.assertEqual(approve_response.status_code, status.HTTP_403_FORBIDDEN)

        reject_response = self.client.post(
            f"/api/v1/admin/gyms/{gym_id}/reject/", **self._auth_header(self.owner.email)
        )
        self.assertEqual(reject_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_approve_non_pending_gym(self):
        gym_id = self._create_pending_gym()
        staff_header = self._auth_header(self.staff.email)
        self.client.post(f"/api/v1/admin/gyms/{gym_id}/approve/", **staff_header)

        second_response = self.client.post(
            f"/api/v1/admin/gyms/{gym_id}/approve/", **staff_header
        )
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_created_gym_is_active_immediately(self):
        response = self.client.post(
            "/api/v1/admin/gyms/",
            {"name": "Admin Seeded Gym", **GYM_FIELDS},
            **self._auth_header(self.staff.email),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "active")


class GymSelfServiceManagementTests(APITestCase):
    def setUp(self):
        self.gym = Gym.objects.create(
            name="Iron Works", status=Gym.Status.ACTIVE, **GYM_FIELDS
        )
        self.owner = User.objects.create_user(email="mgmt_owner@example.com", password=PASSWORD)
        self.manager = User.objects.create_user(email="mgmt_manager@example.com", password=PASSWORD)
        self.staff_member = User.objects.create_user(
            email="mgmt_staff@example.com", password=PASSWORD
        )
        self.outsider = User.objects.create_user(
            email="mgmt_outsider@example.com", password=PASSWORD
        )
        self.member = User.objects.create_user(email="mgmt_member@example.com", password=PASSWORD)

        GymMembership.objects.create(
            user=self.owner,
            gym=self.gym,
            role=GymMembership.Role.OWNER,
            status=GymMembership.Status.ACTIVE,
        )
        GymMembership.objects.create(
            user=self.manager,
            gym=self.gym,
            role=GymMembership.Role.MANAGER,
            status=GymMembership.Status.ACTIVE,
        )
        GymMembership.objects.create(
            user=self.staff_member,
            gym=self.gym,
            role=GymMembership.Role.STAFF,
            status=GymMembership.Status.ACTIVE,
        )
        GymMembership.objects.create(
            user=self.member,
            gym=self.gym,
            role=GymMembership.Role.MEMBER,
            status=GymMembership.Status.ACTIVE,
        )

    def tearDown(self):
        cache.clear()

    def _auth_header(self, email):
        response = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": PASSWORD}
        )
        return {"HTTP_AUTHORIZATION": f"Bearer {response.data['access']}"}

    def test_owner_can_update_profile(self):
        response = self.client.patch(
            f"/api/v1/gyms/{self.gym.id}/",
            {"name": "Iron Works Updated"},
            **self._auth_header(self.owner.email),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Iron Works Updated")

        public_response = self.client.get(f"/api/v1/gyms/{self.gym.id}/")
        self.assertEqual(public_response.data["name"], "Iron Works Updated")

    def test_manager_staff_and_outsider_cannot_update_profile(self):
        for email in (self.manager.email, self.staff_member.email, self.outsider.email):
            response = self.client.patch(
                f"/api/v1/gyms/{self.gym.id}/",
                {"name": "Hijacked"},
                **self._auth_header(email),
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, email)

    def test_any_staff_tier_can_view_members(self):
        for email in (self.owner.email, self.manager.email, self.staff_member.email):
            response = self.client.get(
                f"/api/v1/gyms/{self.gym.id}/members/", **self._auth_header(email)
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, email)
            emails = [row["user"]["email"] for row in response.data["results"]]
            self.assertEqual(emails, [self.member.email])

    def test_outsider_cannot_view_members_or_devices(self):
        members_response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/members/", **self._auth_header(self.outsider.email)
        )
        self.assertEqual(members_response.status_code, status.HTTP_403_FORBIDDEN)

        devices_response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/devices/", **self._auth_header(self.outsider.email)
        )
        self.assertEqual(devices_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_detail_includes_streak_and_checkins(self):
        member_membership = GymMembership.objects.get(user=self.member, gym=self.gym)
        response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/members/{member_membership.id}/",
            **self._auth_header(self.staff_member.email),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["email"], self.member.email)
        self.assertIn("current_streak", response.data["streak"])
        self.assertEqual(response.data["recent_checkins"], [])

    def test_outsider_cannot_view_member_detail(self):
        member_membership = GymMembership.objects.get(user=self.member, gym=self.gym)
        response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/members/{member_membership.id}/",
            **self._auth_header(self.outsider.email),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_remove_member_but_manager_can(self):
        member_membership = GymMembership.objects.get(user=self.member, gym=self.gym)

        forbidden_response = self.client.delete(
            f"/api/v1/gyms/{self.gym.id}/members/{member_membership.id}/",
            **self._auth_header(self.staff_member.email),
        )
        self.assertEqual(forbidden_response.status_code, status.HTTP_403_FORBIDDEN)

        removed_response = self.client.delete(
            f"/api/v1/gyms/{self.gym.id}/members/{member_membership.id}/",
            **self._auth_header(self.manager.email),
        )
        self.assertEqual(removed_response.status_code, status.HTTP_204_NO_CONTENT)

        member_membership.refresh_from_db()
        self.assertEqual(member_membership.status, GymMembership.Status.INACTIVE)

        list_response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/members/", **self._auth_header(self.owner.email)
        )
        self.assertEqual(list_response.data["results"], [])

    def test_staff_can_list_gym_devices(self):
        create_response = self.client.post(
            "/api/v1/gym-devices/",
            {"gym": str(self.gym.id), "name": "Front Desk"},
            **self._auth_header(self.staff_member.email),
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        list_response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/devices/", **self._auth_header(self.manager.email)
        )
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        names = [row["name"] for row in list_response.data["results"]]
        self.assertEqual(names, ["Front Desk"])


class GymStaffInviteAndManagementTests(APITestCase):
    def setUp(self):
        self.gym = Gym.objects.create(
            name="Iron Works", status=Gym.Status.ACTIVE, **GYM_FIELDS
        )
        self.owner = User.objects.create_user(email="invite_owner@example.com", password=PASSWORD)
        self.manager = User.objects.create_user(
            email="invite_manager@example.com", password=PASSWORD
        )
        self.other_gym = Gym.objects.create(
            name="Other Gym", status=Gym.Status.ACTIVE, **GYM_FIELDS
        )
        self.outsider = User.objects.create_user(
            email="invite_outsider@example.com", password=PASSWORD
        )

        GymMembership.objects.create(
            user=self.owner,
            gym=self.gym,
            role=GymMembership.Role.OWNER,
            status=GymMembership.Status.ACTIVE,
        )
        GymMembership.objects.create(
            user=self.manager,
            gym=self.gym,
            role=GymMembership.Role.MANAGER,
            status=GymMembership.Status.ACTIVE,
        )

    def tearDown(self):
        cache.clear()

    def _auth_header(self, email):
        response = self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": PASSWORD}
        )
        return {"HTTP_AUTHORIZATION": f"Bearer {response.data['access']}"}

    def _extract_token(self, email_body):
        match = re.search(r"/staff-invites/([\w-]+)", email_body)
        self.assertIsNotNone(match, f"No invite link found in email body: {email_body}")
        return match.group(1)

    def test_owner_can_invite_new_email_and_full_lifecycle_works(self):
        invitee_email = "brand_new@example.com"

        with self.captureOnCommitCallbacks(execute=True):
            invite_response = self.client.post(
                f"/api/v1/gyms/{self.gym.id}/staff-invites/",
                {"email": invitee_email, "role": "staff"},
                **self._auth_header(self.owner.email),
            )
        self.assertEqual(invite_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        token = self._extract_token(mail.outbox[0].body)

        # Preview works unauthenticated
        preview_response = self.client.get(f"/api/v1/staff-invites/{token}/")
        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_response.data["email"], invitee_email)
        self.assertEqual(preview_response.data["role"], "staff")
        self.assertEqual(preview_response.data["gym"]["id"], str(self.gym.id))

        # Accepting while unauthenticated fails
        unauth_accept = self.client.post(f"/api/v1/staff-invites/{token}/accept/")
        self.assertEqual(unauth_accept.status_code, status.HTTP_401_UNAUTHORIZED)

        # The invitee doesn't have an account yet -- register, then accept
        register_response = self.client.post(
            "/api/v1/auth/register/", {"email": invitee_email, "password": PASSWORD}
        )
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)
        invitee_header = self._auth_header(invitee_email)

        accept_response = self.client.post(
            f"/api/v1/staff-invites/{token}/accept/", **invitee_header
        )
        self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_response.data["role"], "staff")

        membership = GymMembership.objects.get(user__email=invitee_email, gym=self.gym)
        self.assertEqual(membership.role, GymMembership.Role.STAFF)
        self.assertEqual(membership.status, GymMembership.Status.ACTIVE)

        # New staff member can now view the roster
        roster_response = self.client.get(
            f"/api/v1/gyms/{self.gym.id}/staff/", **invitee_header
        )
        self.assertEqual(roster_response.status_code, status.HTTP_200_OK)

    def test_accept_rejects_mismatched_email(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                f"/api/v1/gyms/{self.gym.id}/staff-invites/",
                {"email": "someone@example.com", "role": "staff"},
                **self._auth_header(self.owner.email),
            )
        token = self._extract_token(mail.outbox[0].body)

        # A different, already-authenticated user tries to accept
        response = self.client.post(
            f"/api/v1/staff-invites/{token}/accept/", **self._auth_header(self.outsider.email)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_invite_manager_or_owner(self):
        for role in ("manager", "owner"):
            response = self.client.post(
                f"/api/v1/gyms/{self.gym.id}/staff-invites/",
                {"email": "someone@example.com", "role": role},
                **self._auth_header(self.manager.email),
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, role)

    def test_manager_can_invite_staff(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/v1/gyms/{self.gym.id}/staff-invites/",
                {"email": "someone@example.com", "role": "staff"},
                **self._auth_header(self.manager.email),
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_outsider_cannot_invite(self):
        response = self.client.post(
            f"/api/v1/gyms/{self.gym.id}/staff-invites/",
            {"email": "someone@example.com", "role": "staff"},
            **self._auth_header(self.outsider.email),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_revoke_pending_invite(self):
        with self.captureOnCommitCallbacks(execute=True):
            invite_response = self.client.post(
                f"/api/v1/gyms/{self.gym.id}/staff-invites/",
                {"email": "someone@example.com", "role": "staff"},
                **self._auth_header(self.owner.email),
            )
        invite_id = invite_response.data["id"]

        revoke_response = self.client.post(
            f"/api/v1/gyms/{self.gym.id}/staff-invites/{invite_id}/revoke/",
            **self._auth_header(self.owner.email),
        )
        self.assertEqual(revoke_response.status_code, status.HTTP_200_OK)
        self.assertEqual(revoke_response.data["status"], "revoked")

        token = self._extract_token(mail.outbox[0].body)
        preview_response = self.client.get(f"/api/v1/staff-invites/{token}/")
        self.assertEqual(preview_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_change_staff_role_and_remove_staff(self):
        staff_user = User.objects.create_user(
            email="existing_staff@example.com", password=PASSWORD
        )
        membership = GymMembership.objects.create(
            user=staff_user,
            gym=self.gym,
            role=GymMembership.Role.STAFF,
            status=GymMembership.Status.ACTIVE,
        )

        role_response = self.client.patch(
            f"/api/v1/gyms/{self.gym.id}/staff/{membership.id}/",
            {"role": "manager"},
            **self._auth_header(self.owner.email),
        )
        self.assertEqual(role_response.status_code, status.HTTP_200_OK)
        membership.refresh_from_db()
        self.assertEqual(membership.role, GymMembership.Role.MANAGER)

        remove_response = self.client.delete(
            f"/api/v1/gyms/{self.gym.id}/staff/{membership.id}/",
            **self._auth_header(self.owner.email),
        )
        self.assertEqual(remove_response.status_code, status.HTTP_204_NO_CONTENT)
        membership.refresh_from_db()
        self.assertEqual(membership.status, GymMembership.Status.INACTIVE)

    def test_cannot_remove_last_owner(self):
        owner_membership = GymMembership.objects.get(user=self.owner, gym=self.gym)
        response = self.client.delete(
            f"/api/v1/gyms/{self.gym.id}/staff/{owner_membership.id}/",
            **self._auth_header(self.owner.email),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_manager_cannot_change_another_managers_role(self):
        second_manager = User.objects.create_user(
            email="second_manager@example.com", password=PASSWORD
        )
        membership = GymMembership.objects.create(
            user=second_manager,
            gym=self.gym,
            role=GymMembership.Role.MANAGER,
            status=GymMembership.Status.ACTIVE,
        )
        response = self.client.patch(
            f"/api/v1/gyms/{self.gym.id}/staff/{membership.id}/",
            {"role": "staff"},
            **self._auth_header(self.manager.email),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
