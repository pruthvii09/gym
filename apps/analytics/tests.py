from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.analytics import services
from apps.checkins.models import CheckIn
from apps.fraud.models import FraudReview
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


class BucketedCountsTests(APITestCase):
    """Pure aggregation logic -- no HTTP involved."""

    def test_zero_fills_gaps(self):
        user = User.objects.create_user(email="bucket@example.com", password=PASSWORD)
        gym = Gym.objects.create(name="Bucket Gym", **GYM_FIELDS)
        today = timezone.localdate()
        CheckIn.objects.create(
            user=user,
            gym=gym,
            status=CheckIn.Status.VERIFIED,
            checked_in_at=timezone.now() - timedelta(days=2),
            verification_method=CheckIn.VerificationMethod.MANUAL,
            latitude=gym.latitude,
            longitude=gym.longitude,
        )
        buckets = services.bucketed_counts(
            CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED),
            "checked_in_at",
            today - timedelta(days=4),
            today,
            services.DAILY,
        )
        self.assertEqual(len(buckets), 5)
        counts = [b["count"] for b in buckets]
        self.assertEqual(counts, [0, 0, 1, 0, 0])

    def test_weekly_granularity_counts_land_in_the_right_bucket(self):
        # Regression: TruncWeek (unlike TruncDate) returns a tz-aware
        # datetime, not a date, unless output_field is forced -- that type
        # mismatch made every weekly bucket silently read back as zero.
        user = User.objects.create_user(email="bucket3@example.com", password=PASSWORD)
        gym = Gym.objects.create(name="Bucket Gym 3", **GYM_FIELDS)
        CheckIn.objects.create(
            user=user,
            gym=gym,
            status=CheckIn.Status.VERIFIED,
            checked_in_at=timezone.now() - timedelta(days=3),
            verification_method=CheckIn.VerificationMethod.MANUAL,
            latitude=gym.latitude,
            longitude=gym.longitude,
        )
        today = timezone.localdate()
        buckets = services.bucketed_counts(
            CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED),
            "checked_in_at",
            today - timedelta(days=13),
            today,
            services.WEEKLY,
        )
        self.assertEqual(sum(b["count"] for b in buckets), 1)

    def test_all_range_resolves_from_earliest_row(self):
        user = User.objects.create_user(email="bucket2@example.com", password=PASSWORD)
        gym = Gym.objects.create(name="Bucket Gym 2", **GYM_FIELDS)
        CheckIn.objects.create(
            user=user,
            gym=gym,
            status=CheckIn.Status.VERIFIED,
            checked_in_at=timezone.now() - timedelta(days=3),
            verification_method=CheckIn.VerificationMethod.MANUAL,
            latitude=gym.latitude,
            longitude=gym.longitude,
        )
        start, end, granularity = services.parse_range("all")
        self.assertIsNone(start)
        buckets = services.bucketed_counts(
            CheckIn.objects.filter(user=user, status=CheckIn.Status.VERIFIED),
            "checked_in_at",
            start,
            end,
            granularity,
        )
        self.assertGreaterEqual(sum(b["count"] for b in buckets), 1)

    def test_empty_queryset_all_range_returns_single_bucket(self):
        start, end, granularity = services.parse_range("all")
        buckets = services.bucketed_counts(
            CheckIn.objects.filter(user_id="00000000-0000-0000-0000-000000000000"),
            "checked_in_at",
            start,
            end,
            granularity,
        )
        self.assertEqual(len(buckets), 1)
        self.assertEqual(buckets[0]["count"], 0)


class MemberAnalyticsApiTests(APITestCase):
    def setUp(self):
        self.member = User.objects.create_user(email="member@example.com", password=PASSWORD)

    def test_requires_auth(self):
        response = self.client.get("/api/v1/me/analytics/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_expected_shape_with_no_activity(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get("/api/v1/me/analytics/?range=30d")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("checkins_over_time", response.data)
        self.assertIn("workout_volume_over_time", response.data)
        self.assertIn("muscle_set_counts", response.data)
        self.assertIn("stats", response.data)
        self.assertEqual(response.data["stats"]["total_checkins"], 0)
        self.assertEqual(response.data["muscle_set_counts"], [])


class GymAnalyticsApiTests(APITestCase):
    def setUp(self):
        self.gym = Gym.objects.create(name="Analytics Gym", **GYM_FIELDS)
        self.staff = User.objects.create_user(email="staff@example.com", password=PASSWORD)
        GymMembership.objects.create(
            user=self.staff, gym=self.gym, role=GymMembership.Role.STAFF
        )
        self.member = User.objects.create_user(email="member2@example.com", password=PASSWORD)
        GymMembership.objects.create(
            user=self.member, gym=self.gym, role=GymMembership.Role.MEMBER
        )
        self.outsider = User.objects.create_user(email="outsider@example.com", password=PASSWORD)

    def test_non_staff_forbidden(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/v1/gyms/{self.gym.id}/analytics/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_view(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(f"/api/v1/gyms/{self.gym.id}/analytics/?range=7d")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["stats"]["total_members"], 1)
        self.assertIn("checkin_heatmap", response.data)


class PlatformAnalyticsApiTests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="staff@example.com", password=PASSWORD, is_staff=True
        )
        self.member = User.objects.create_user(email="member@example.com", password=PASSWORD)

    def test_non_staff_forbidden(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.get("/api/v1/admin/analytics/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_sees_full_payload(self):
        FraudReview.objects.create(user=self.member, risk_level=FraudReview.RiskLevel.HIGH)
        self.client.force_authenticate(user=self.staff)
        response = self.client.get("/api/v1/admin/analytics/?range=30d")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["stats"]["open_fraud_reviews"], 1)
        self.assertTrue(
            all({"open", "approved", "rejected", "period"} <= set(row) for row in response.data["fraud_reviews_over_time"])
        )
        self.assertEqual(len(response.data["streak_distribution"]), 5)
