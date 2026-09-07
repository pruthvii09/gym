from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from pywebpush import WebPushException
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import Notification, NotificationType, PushSubscription
from apps.notifications.push import send_web_push
from apps.notifications.services import notify
from apps.users.models import User


class NotifyPushDispatchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="member@example.com", password="MemberPass123!")
        self.other = User.objects.create_user(email="other@example.com", password="OtherPass123!")

    @patch("apps.notifications.tasks.send_push_notification_task.delay")
    def test_notify_schedules_push_task_on_creation(self, mock_delay):
        with self.captureOnCommitCallbacks(execute=True):
            notify(
                user=self.user,
                notification_type=NotificationType.SYSTEM,
                title="Hi",
                message="Hello",
            )
        mock_delay.assert_called_once()

    @patch("apps.notifications.tasks.send_push_notification_task.delay")
    def test_notify_does_not_re_dispatch_on_idempotent_replay(self, mock_delay):
        kwargs = dict(
            user=self.user,
            notification_type=NotificationType.NEW_FOLLOWER,
            title="New follower",
            message="Someone followed you",
            related_object=self.other,
        )
        with self.captureOnCommitCallbacks(execute=True):
            notify(**kwargs)
        with self.captureOnCommitCallbacks(execute=True):
            notify(**kwargs)

        self.assertEqual(Notification.objects.count(), 1)
        mock_delay.assert_called_once()


class SendWebPushTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="member@example.com", password="MemberPass123!")
        self.subscription = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://push.example.com/abc",
            p256dh_key="p256dh",
            auth_key="auth",
        )

    @patch("apps.notifications.push.webpush")
    def test_successful_send_leaves_subscription_enabled(self, mock_webpush):
        result = send_web_push(subscription=self.subscription, payload="{}")
        self.assertTrue(result)
        self.subscription.refresh_from_db()
        self.assertIsNone(self.subscription.disabled_at)

    @patch("apps.notifications.push.webpush")
    def test_gone_response_disables_subscription(self, mock_webpush):
        mock_webpush.side_effect = WebPushException("gone", response=SimpleNamespace(status_code=410))
        result = send_web_push(subscription=self.subscription, payload="{}")
        self.assertFalse(result)
        self.subscription.refresh_from_db()
        self.assertIsNotNone(self.subscription.disabled_at)

    @patch("apps.notifications.push.webpush")
    def test_transient_error_does_not_disable_subscription(self, mock_webpush):
        mock_webpush.side_effect = WebPushException("timeout", response=SimpleNamespace(status_code=500))
        result = send_web_push(subscription=self.subscription, payload="{}")
        self.assertFalse(result)
        self.subscription.refresh_from_db()
        self.assertIsNone(self.subscription.disabled_at)


class PushSubscriptionEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="member@example.com", password="MemberPass123!")
        self.client.force_authenticate(user=self.user)

    def test_register_creates_subscription(self):
        response = self.client.post(
            "/api/v1/me/push-subscriptions/",
            {
                "endpoint": "https://push.example.com/xyz",
                "keys": {"p256dh": "p256dh", "auth": "auth"},
                "user_agent": "test-agent",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            PushSubscription.objects.filter(
                user=self.user, endpoint="https://push.example.com/xyz"
            ).exists()
        )

    def test_register_is_idempotent_by_endpoint_and_clears_disabled_at(self):
        subscription = PushSubscription.objects.create(
            user=self.user,
            endpoint="https://push.example.com/xyz",
            p256dh_key="old",
            auth_key="old",
        )
        subscription.disabled_at = subscription.created_at
        subscription.save(update_fields=["disabled_at"])

        response = self.client.post(
            "/api/v1/me/push-subscriptions/",
            {
                "endpoint": "https://push.example.com/xyz",
                "keys": {"p256dh": "new", "auth": "new"},
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(PushSubscription.objects.count(), 1)
        subscription.refresh_from_db()
        self.assertIsNone(subscription.disabled_at)
        self.assertEqual(subscription.p256dh_key, "new")

    def test_unregister_deletes_owned_subscription(self):
        PushSubscription.objects.create(
            user=self.user,
            endpoint="https://push.example.com/xyz",
            p256dh_key="p",
            auth_key="a",
        )
        response = self.client.delete(
            "/api/v1/me/push-subscriptions/",
            {"endpoint": "https://push.example.com/xyz"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PushSubscription.objects.exists())

    def test_unregister_unowned_endpoint_returns_404(self):
        other = User.objects.create_user(email="other@example.com", password="OtherPass123!")
        PushSubscription.objects.create(
            user=other, endpoint="https://push.example.com/xyz", p256dh_key="p", auth_key="a"
        )
        response = self.client.delete(
            "/api/v1/me/push-subscriptions/",
            {"endpoint": "https://push.example.com/xyz"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class VapidPublicKeyViewTests(APITestCase):
    def test_public_key_is_readable_unauthenticated(self):
        response = self.client.get("/api/v1/push/vapid-public-key/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("public_key", response.data)


class UnreadNotificationCountViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="member@example.com", password="MemberPass123!")
        self.client.force_authenticate(user=self.user)

    def test_counts_only_unread_for_the_caller(self):
        other = User.objects.create_user(email="other@example.com", password="OtherPass123!")
        with self.captureOnCommitCallbacks(execute=True):
            notify(user=self.user, notification_type=NotificationType.SYSTEM, title="A", message="a")
            notify(user=self.user, notification_type=NotificationType.SYSTEM, title="B", message="b")
            read_one = notify(
                user=self.user, notification_type=NotificationType.SYSTEM, title="C", message="c"
            )
            notify(user=other, notification_type=NotificationType.SYSTEM, title="D", message="d")

        read_one.read_at = read_one.created_at
        read_one.save(update_fields=["read_at"])

        response = self.client.get("/api/v1/me/notifications/unread-count/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
