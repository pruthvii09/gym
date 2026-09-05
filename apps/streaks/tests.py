from datetime import date, timedelta

from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.gyms.models import Gym, GymMembership
from apps.streaks import calculator, services
from apps.streaks.models import UserRestDay
from apps.users.models import User

PASSWORD = "SuperSecret123!"

POLICY = calculator.StreakPolicyData(
    minimum_days_per_week=2, allowed_rest_days=1, grace_period=120, freeze_count=2
)
# A policy with no generic allowance at all, so a gap only ever survives if
# the rest day forgives it -- isolates the new behavior from the pre-existing
# allowed_rest_days/freeze_count mechanism in the "still breaks" tests below.
NO_ALLOWANCE_POLICY = calculator.StreakPolicyData(
    minimum_days_per_week=0, allowed_rest_days=0, grace_period=120, freeze_count=0
)

# 2026-08-31 is a Monday.
MON, TUE, WED, THU, FRI, SAT, SUN = (date(2026, 8, 31) + timedelta(days=i) for i in range(7))
NEXT_MON = MON + timedelta(days=7)


class CalculateStreakRestDayTests(APITestCase):
    """Pure calculator.calculate_streak tests -- no DB needed. rest_day_of_week
    uses date.weekday()'s convention (0=Monday..6=Sunday).
    """

    def test_gap_on_rest_day_does_not_break_streak(self):
        # Checked in Sat, skipped Sun (rest day), checked in Mon -- with a
        # policy that grants zero generic allowance, only the rest day can
        # be saving this.
        gym_days = [SAT, NEXT_MON]
        result = calculator.calculate_streak(
            gym_days, NO_ALLOWANCE_POLICY, today=NEXT_MON, rest_day_of_week=SUN.weekday()
        )
        self.assertEqual(result.current_streak, (NEXT_MON - SAT).days + 1)

    def test_gap_on_non_rest_day_still_breaks_with_no_allowance(self):
        # Same shape, but the skipped day (Sun) is not the designated rest
        # day (Wed) -- regression check that forgiveness is weekday-specific.
        gym_days = [SAT, NEXT_MON]
        result = calculator.calculate_streak(
            gym_days, NO_ALLOWANCE_POLICY, today=NEXT_MON, rest_day_of_week=WED.weekday()
        )
        self.assertEqual(result.current_streak, 1)  # only the Monday check-in survives

    def test_no_rest_day_set_behaves_exactly_as_before(self):
        gym_days = [SAT, NEXT_MON]
        with_none = calculator.calculate_streak(gym_days, POLICY, today=NEXT_MON, rest_day_of_week=None)
        without_param = calculator.calculate_streak(gym_days, POLICY, today=NEXT_MON)
        self.assertEqual(with_none, without_param)

    def test_rest_day_does_not_bypass_minimum_days_per_week(self):
        # Checked in every day this week except Tuesday (the forgiven rest
        # day) -- 6 of 7 days. A minimum_days_per_week of 7 can never be
        # satisfied with Tuesday always missing, so the run should still
        # break for insufficient frequency even though the Tuesday gap
        # itself is never what breaks it.
        policy = calculator.StreakPolicyData(
            minimum_days_per_week=7, allowed_rest_days=0, grace_period=120, freeze_count=0
        )
        gym_days = [MON, WED, THU, FRI, SAT, SUN]
        result = calculator.calculate_streak(
            gym_days, policy, today=SUN, rest_day_of_week=TUE.weekday()
        )
        # Broken at Sunday (window count 6 < required 7) -- only Sunday
        # itself survives as the new run, not the full Mon-Sun span.
        self.assertEqual(result.current_streak, 1)
        self.assertEqual(result.longest_streak, 6)

    def test_tail_gap_still_alive_on_rest_day(self):
        # Last verified check-in Friday; today is Sunday (the rest day) with
        # nothing checked in yet today -- streak should still read as alive.
        gym_days = [FRI]
        result = calculator.calculate_streak(
            gym_days, NO_ALLOWANCE_POLICY, today=SUN, rest_day_of_week=SAT.weekday()
        )
        self.assertEqual(result.current_streak, 1)

    def test_tail_gap_broken_when_not_rest_day(self):
        gym_days = [FRI]
        result = calculator.calculate_streak(
            gym_days, NO_ALLOWANCE_POLICY, today=SUN, rest_day_of_week=WED.weekday()
        )
        self.assertEqual(result.current_streak, 0)


class SetRestDayServiceTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(email="member@example.com", password=PASSWORD)

    def test_self_service_change_limit_enforced(self):
        for day in range(services.REST_DAY_SELF_SERVICE_LIMIT):
            services.set_rest_day(
                actor=self.member, user=self.member, day_of_week=day, is_self_service=True
            )
        rest_day = UserRestDay.objects.get(user=self.member)
        self.assertEqual(rest_day.self_service_changes_used, services.REST_DAY_SELF_SERVICE_LIMIT)

        with self.assertRaises(Exception):
            services.set_rest_day(
                actor=self.member, user=self.member, day_of_week=6, is_self_service=True
            )
        rest_day.refresh_from_db()
        # Rejected attempt must not have mutated anything.
        self.assertEqual(rest_day.self_service_changes_used, services.REST_DAY_SELF_SERVICE_LIMIT)
        self.assertNotEqual(rest_day.day_of_week, 6)

    def test_staff_override_resets_quota_and_is_audited(self):
        staff = User.objects.create_user(
            email="staff@example.com", password=PASSWORD, is_staff=True
        )
        for day in range(services.REST_DAY_SELF_SERVICE_LIMIT):
            services.set_rest_day(
                actor=self.member, user=self.member, day_of_week=day, is_self_service=True
            )

        services.set_rest_day(actor=staff, user=self.member, day_of_week=6, is_self_service=False)

        rest_day = UserRestDay.objects.get(user=self.member)
        self.assertEqual(rest_day.day_of_week, 6)
        self.assertEqual(rest_day.self_service_changes_used, 0)
        self.assertTrue(
            AuditLog.objects.filter(
                action="streak.rest_day.staff_override", entity_id=str(rest_day.pk)
            ).exists()
        )

        # The member can self-service again after a staff override.
        services.set_rest_day(
            actor=self.member, user=self.member, day_of_week=0, is_self_service=True
        )
        rest_day.refresh_from_db()
        self.assertEqual(rest_day.self_service_changes_used, 1)


class RestDayApiTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(email="member@example.com", password=PASSWORD)
        self.gym = Gym.objects.create(
            name="Downtown Fitness",
            address="1 Main St",
            city="NYC",
            country="US",
            latitude="40.712800",
            longitude="-74.006000",
        )
        self.membership = GymMembership.objects.create(
            user=self.member, gym=self.gym, role=GymMembership.Role.MEMBER
        )
        self.staff = User.objects.create_user(email="staff@example.com", password=PASSWORD)
        GymMembership.objects.create(
            user=self.staff, gym=self.gym, role=GymMembership.Role.STAFF
        )

    def test_member_can_set_and_read_own_rest_day(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.patch("/api/v1/me/rest-day/", {"day_of_week": 6})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["day_of_week"], 6)
        self.assertEqual(response.data["self_service_changes_remaining"], 1)

        response = self.client.get("/api/v1/me/rest-day/")
        self.assertEqual(response.data["day_of_week"], 6)

    def test_self_service_limit_returns_400_over_api(self):
        self.client.force_authenticate(user=self.member)
        for day in range(services.REST_DAY_SELF_SERVICE_LIMIT):
            response = self.client.patch("/api/v1/me/rest-day/", {"day_of_week": day})
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.patch("/api/v1/me/rest-day/", {"day_of_week": 6})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_plain_staff_role_can_override_a_members_rest_day(self):
        # STAFF (not just OWNER/MANAGER) must be able to do this.
        self.client.force_authenticate(user=self.staff)
        response = self.client.patch(
            f"/api/v1/gyms/{self.gym.id}/members/{self.membership.id}/rest-day/",
            {"day_of_week": 3},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["day_of_week"], 3)
        self.assertEqual(response.data["self_service_changes_remaining"], services.REST_DAY_SELF_SERVICE_LIMIT)

    def test_non_staff_cannot_override_a_members_rest_day(self):
        other_member = User.objects.create_user(email="other@example.com", password=PASSWORD)
        GymMembership.objects.create(
            user=other_member, gym=self.gym, role=GymMembership.Role.MEMBER
        )
        self.client.force_authenticate(user=other_member)
        response = self.client.patch(
            f"/api/v1/gyms/{self.gym.id}/members/{self.membership.id}/rest-day/",
            {"day_of_week": 3},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_gym_member_detail_includes_rest_day(self):
        services.set_rest_day(
            actor=self.member, user=self.member, day_of_week=2, is_self_service=True
        )
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f"/api/v1/gyms/{self.gym.id}/members/{self.membership.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["rest_day"]["day_of_week"], 2)
