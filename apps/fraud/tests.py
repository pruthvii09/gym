from rest_framework import status
from rest_framework.test import APITestCase

from apps.fraud.models import FraudEvent, FraudReview
from apps.gyms.models import Gym
from apps.users.models import User

PASSWORD = "SuperSecret123!"

GYM_FIELDS = {
    "address": "1 Main St",
    "city": "NYC",
    "country": "US",
    "latitude": "40.712800",
    "longitude": "-74.006000",
}


class FraudTestBase(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="staff@example.com", password=PASSWORD, is_staff=True
        )
        self.member = User.objects.create_user(email="member@example.com", password=PASSWORD)
        self.other_member = User.objects.create_user(
            email="other@example.com", password=PASSWORD
        )

    def auth_as(self, user):
        self.client.force_authenticate(user=user)


class AdminFraudReviewListTests(FraudTestBase):
    def setUp(self):
        super().setUp()
        self.open_high = FraudReview.objects.create(
            user=self.member,
            risk_level=FraudReview.RiskLevel.HIGH,
            reason="Automated: HIGH risk",
        )
        self.resolved_low = FraudReview.objects.create(
            user=self.other_member,
            risk_level=FraudReview.RiskLevel.LOW,
            status=FraudReview.Status.APPROVED,
            reason="manually flagged",
        )

    def test_non_staff_forbidden(self):
        self.auth_as(self.member)
        response = self.client.get("/api/v1/admin/fraud-reviews/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_by_status(self):
        self.auth_as(self.staff)
        response = self.client.get("/api/v1/admin/fraud-reviews/?status=open")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(self.open_high.id)])

    def test_filter_by_risk_level(self):
        self.auth_as(self.staff)
        response = self.client.get("/api/v1/admin/fraud-reviews/?risk_level=low")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(self.resolved_low.id)])

    def test_search_by_email(self):
        self.auth_as(self.staff)
        response = self.client.get("/api/v1/admin/fraud-reviews/?search=other@")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(self.resolved_low.id)])


class AdminFraudReviewResolveTests(FraudTestBase):
    def setUp(self):
        super().setUp()
        self.review = FraudReview.objects.create(
            user=self.member, risk_level=FraudReview.RiskLevel.HIGH, reason="test"
        )

    def test_approve_from_open(self):
        self.auth_as(self.staff)
        response = self.client.post(
            f"/api/v1/admin/fraud-reviews/{self.review.id}/resolve/",
            {"status": "approved", "resolution_notes": "confirmed fraud"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, "approved")
        self.assertEqual(self.review.resolved_by, self.staff)
        self.assertIsNotNone(self.review.resolved_at)

    def test_reject_from_open(self):
        self.auth_as(self.staff)
        response = self.client.post(
            f"/api/v1/admin/fraud-reviews/{self.review.id}/resolve/",
            {"status": "rejected"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, "rejected")

    def test_cannot_resolve_already_resolved_review(self):
        self.auth_as(self.staff)
        self.client.post(
            f"/api/v1/admin/fraud-reviews/{self.review.id}/resolve/", {"status": "approved"}
        )
        response = self.client.post(
            f"/api/v1/admin/fraud-reviews/{self.review.id}/resolve/", {"status": "rejected"}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_staff_forbidden(self):
        self.auth_as(self.member)
        response = self.client.post(
            f"/api/v1/admin/fraud-reviews/{self.review.id}/resolve/", {"status": "approved"}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AdminFraudEventListTests(FraudTestBase):
    def setUp(self):
        super().setUp()
        self.gym = Gym.objects.create(name="Downtown Fitness", **GYM_FIELDS)
        self.review = FraudReview.objects.create(
            user=self.member, risk_level=FraudReview.RiskLevel.MEDIUM
        )
        self.event = FraudEvent.objects.create(
            user=self.member,
            event_type=FraudEvent.EventType.GPS_MISMATCH,
            details="distance=999m",
            review=self.review,
        )
        self.other_event = FraudEvent.objects.create(
            user=self.other_member, event_type=FraudEvent.EventType.QR_REUSE
        )

    def test_filter_by_user(self):
        self.auth_as(self.staff)
        response = self.client.get(f"/api/v1/admin/fraud-events/?user={self.member.id}")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(self.event.id)])

    def test_filter_by_event_type(self):
        self.auth_as(self.staff)
        response = self.client.get("/api/v1/admin/fraud-events/?event_type=qr_reuse")
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["event_type"], "qr_reuse")

    def test_search_by_email(self):
        self.auth_as(self.staff)
        response = self.client.get("/api/v1/admin/fraud-events/?search=other@")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(self.other_event.id)])

    def test_filter_by_review(self):
        self.auth_as(self.staff)
        response = self.client.get(f"/api/v1/admin/fraud-events/?review={self.review.id}")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(self.event.id)])

    def test_non_staff_forbidden(self):
        self.auth_as(self.member)
        response = self.client.get("/api/v1/admin/fraud-events/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AdminCreateReviewFromEventsTests(FraudTestBase):
    def setUp(self):
        super().setUp()
        self.event1 = FraudEvent.objects.create(
            user=self.member, event_type=FraudEvent.EventType.QR_REUSE
        )
        self.event2 = FraudEvent.objects.create(
            user=self.member, event_type=FraudEvent.EventType.GPS_MISMATCH
        )
        self.other_event = FraudEvent.objects.create(
            user=self.other_member, event_type=FraudEvent.EventType.QR_REUSE
        )

    def test_creates_review_and_links_events(self):
        self.auth_as(self.staff)
        response = self.client.post(
            "/api/v1/admin/fraud-reviews/from-events/",
            {"event_ids": [str(self.event1.id), str(self.event2.id)], "reason": "spotted a pattern"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        review_id = response.data["id"]
        self.event1.refresh_from_db()
        self.event2.refresh_from_db()
        self.assertEqual(str(self.event1.review_id), review_id)
        self.assertEqual(str(self.event2.review_id), review_id)

    def test_rejects_events_from_multiple_users(self):
        self.auth_as(self.staff)
        response = self.client.post(
            "/api/v1/admin/fraud-reviews/from-events/",
            {"event_ids": [str(self.event1.id), str(self.other_event.id)]},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_staff_forbidden(self):
        self.auth_as(self.member)
        response = self.client.post(
            "/api/v1/admin/fraud-reviews/from-events/", {"event_ids": [str(self.event1.id)]}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
