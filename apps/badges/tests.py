from rest_framework import status
from rest_framework.test import APITestCase

from apps.badges.models import Badge, UserBadge
from apps.badges.services import evaluate_badges, set_featured
from apps.checkins.models import CheckIn
from apps.gyms.models import Gym, GymMembership
from apps.streaks.models import UserStreak
from apps.users.models import User


class BadgeEvaluationTests(APITestCase):
    def setUp(self):
        # Deactivate the seed migration's real badges so these tests are
        # hermetic -- otherwise e.g. the seeded "week-warrior" (streak>=7)
        # would also fire alongside a test badge with the same threshold.
        Badge.objects.update(is_active=False)
        self.user = User.objects.create_user(email="badgeuser@example.com", password="SuperSecret123!")

    def test_evaluate_badges_crosses_streak_threshold(self):
        Badge.objects.create(
            key="test-streak-7",
            name="Test Streak 7",
            description="7-day streak",
            metric=Badge.Metric.CURRENT_STREAK,
            threshold=7,
        )
        UserStreak.objects.create(user=self.user, current_streak=7, longest_streak=7)

        earned = evaluate_badges(self.user)
        self.assertEqual(len(earned), 1)
        self.assertEqual(earned[0].badge.key, "test-streak-7")

    def test_evaluate_badges_below_threshold_does_not_earn(self):
        Badge.objects.create(
            key="test-streak-30",
            name="Test Streak 30",
            description="30-day streak",
            metric=Badge.Metric.CURRENT_STREAK,
            threshold=30,
        )
        UserStreak.objects.create(user=self.user, current_streak=5, longest_streak=5)

        earned = evaluate_badges(self.user)
        self.assertEqual(earned, [])

    def test_evaluate_badges_is_idempotent(self):
        badge = Badge.objects.create(
            key="test-checkin-1",
            name="Test Checkin",
            description="1 check-in",
            metric=Badge.Metric.TOTAL_CHECKINS,
            threshold=1,
        )
        gym = Gym.objects.create(
            name="G", address="a", city="c", country="US", latitude="1", longitude="1"
        )
        CheckIn.objects.create(
            user=self.user,
            gym=gym,
            status=CheckIn.Status.VERIFIED,
            verification_method=CheckIn.VerificationMethod.QR,
            latitude="1",
            longitude="1",
        )

        first = evaluate_badges(self.user)
        second = evaluate_badges(self.user)
        self.assertEqual(len(first), 1)
        self.assertEqual(second, [])
        self.assertEqual(UserBadge.objects.filter(user=self.user, badge=badge).count(), 1)

    def test_evaluate_badges_does_not_reclawback_below_threshold(self):
        """Sticky, same as rewards: dropping back below threshold later
        never removes an already-earned badge."""
        Badge.objects.create(
            key="test-streak-sticky",
            name="Sticky",
            description="7-day streak",
            metric=Badge.Metric.CURRENT_STREAK,
            threshold=7,
        )
        streak = UserStreak.objects.create(user=self.user, current_streak=7, longest_streak=7)
        evaluate_badges(self.user)
        self.assertEqual(UserBadge.objects.filter(user=self.user).count(), 1)

        streak.current_streak = 0
        streak.save(update_fields=["current_streak"])
        evaluate_badges(self.user)
        self.assertEqual(UserBadge.objects.filter(user=self.user).count(), 1)


class SetFeaturedBadgesTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="featureduser@example.com", password="SuperSecret123!")
        self.badges = [
            Badge.objects.create(
                key=f"badge-{i}", name=f"Badge {i}", description="d", metric=Badge.Metric.TOTAL_CHECKINS, threshold=1
            )
            for i in range(3)
        ]
        self.user_badges = [
            UserBadge.objects.create(user=self.user, badge=badge) for badge in self.badges
        ]

    def test_set_featured_accepts_up_to_two(self):
        featured = set_featured(
            user=self.user, badge_ids=[str(self.user_badges[0].badge_id), str(self.user_badges[1].badge_id)]
        )
        self.assertEqual(len(featured), 2)

    def test_set_featured_rejects_more_than_two(self):
        with self.assertRaises(Exception):
            set_featured(user=self.user, badge_ids=[str(ub.badge_id) for ub in self.user_badges])

    def test_set_featured_rejects_badge_user_does_not_own(self):
        other_user = User.objects.create_user(email="other@example.com", password="SuperSecret123!")
        other_badge = Badge.objects.create(
            key="not-owned", name="Not owned", description="d", metric=Badge.Metric.TOTAL_CHECKINS, threshold=1
        )
        UserBadge.objects.create(user=other_user, badge=other_badge)

        with self.assertRaises(Exception):
            set_featured(user=self.user, badge_ids=[str(other_badge.id)])

    def test_set_featured_replaces_previous_selection(self):
        set_featured(user=self.user, badge_ids=[str(self.user_badges[0].badge_id)])
        set_featured(user=self.user, badge_ids=[str(self.user_badges[1].badge_id)])

        featured_ids = set(
            UserBadge.objects.filter(user=self.user, is_featured=True).values_list("badge_id", flat=True)
        )
        self.assertEqual(featured_ids, {self.user_badges[1].badge_id})


class BadgeApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="badgeapi@example.com", password="SuperSecret123!", username="badgeapiuser"
        )
        login = self.client.post(
            "/api/v1/auth/login/", {"email": "badgeapi@example.com", "password": "SuperSecret123!"}
        )
        self.auth_header = {"HTTP_AUTHORIZATION": f"Bearer {login.data['access']}"}

    def test_my_badges_lists_active_badges_with_progress(self):
        response = self.client.get("/api/v1/me/badges/", **self.auth_header)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertIn("current_value", response.data[0])

    def test_checkin_response_includes_badges_unlocked_key(self):
        """Not exercising a real verified check-in (needs QR/session setup
        covered elsewhere) -- a rejected one (bad token, real gym) still
        goes through _persist and confirms the response always carries the
        key so the frontend can rely on it unconditionally."""
        gym = Gym.objects.create(
            name="G", address="a", city="c", country="US", latitude="1", longitude="1"
        )
        GymMembership.objects.create(
            user=self.user, gym=gym, role=GymMembership.Role.MEMBER, status=GymMembership.Status.ACTIVE
        )
        response = self.client.post(
            "/api/v1/checkins/",
            {
                "gym_id": str(gym.id),
                "qr_token": "invalid",
                "latitude": "1",
                "longitude": "1",
            },
            **self.auth_header,
        )
        self.assertIn("badges_unlocked", response.data)
