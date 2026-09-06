from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.notifications.models import Notification, NotificationType
from apps.social.models import ActivityItem, ActivityType, Follow
from apps.social.services import (
    follow_user,
    follower_count,
    following_count,
    get_feed,
    is_following,
    record_activity,
    unfollow_user,
)
from apps.users.models import User


class FollowServiceTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(email="alice@example.com", password="SuperSecret123!")
        self.bob = User.objects.create_user(email="bob@example.com", password="SuperSecret123!")

    def test_follow_creates_relationship(self):
        follow, created = follow_user(follower=self.alice, target=self.bob)
        self.assertTrue(created)
        self.assertTrue(Follow.objects.filter(follower=self.alice, following=self.bob).exists())
        self.assertTrue(is_following(self.alice, self.bob))

    def test_follow_is_idempotent(self):
        follow_user(follower=self.alice, target=self.bob)
        _, created = follow_user(follower=self.alice, target=self.bob)
        self.assertFalse(created)
        self.assertEqual(Follow.objects.filter(follower=self.alice, following=self.bob).count(), 1)

    def test_cannot_follow_self(self):
        with self.assertRaises(ValidationError):
            follow_user(follower=self.alice, target=self.alice)

    def test_unfollow_removes_relationship(self):
        follow_user(follower=self.alice, target=self.bob)
        unfollow_user(follower=self.alice, target=self.bob)
        self.assertFalse(is_following(self.alice, self.bob))

    def test_unfollow_when_not_following_is_a_no_op(self):
        unfollow_user(follower=self.alice, target=self.bob)  # should not raise

    def test_follower_and_following_counts(self):
        follow_user(follower=self.alice, target=self.bob)
        self.assertEqual(follower_count(self.bob), 1)
        self.assertEqual(following_count(self.alice), 1)
        self.assertEqual(follower_count(self.alice), 0)

    def test_follow_dispatches_new_follower_notification(self):
        with self.captureOnCommitCallbacks(execute=True):
            follow_user(follower=self.alice, target=self.bob)

        self.assertTrue(
            Notification.objects.filter(
                user=self.bob, type=NotificationType.NEW_FOLLOWER
            ).exists()
        )

    def test_refollowing_does_not_duplicate_notification(self):
        with self.captureOnCommitCallbacks(execute=True):
            follow_user(follower=self.alice, target=self.bob)
        unfollow_user(follower=self.alice, target=self.bob)
        with self.captureOnCommitCallbacks(execute=True):
            follow_user(follower=self.alice, target=self.bob)

        self.assertEqual(
            Notification.objects.filter(
                user=self.bob, type=NotificationType.NEW_FOLLOWER
            ).count(),
            2,
        )


class ActivityFeedTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(email="alice2@example.com", password="SuperSecret123!")
        self.bob = User.objects.create_user(email="bob2@example.com", password="SuperSecret123!")
        self.carol = User.objects.create_user(email="carol@example.com", password="SuperSecret123!")

    def test_record_activity_dedupes_on_related_object(self):
        item1 = record_activity(
            user=self.bob, activity_type=ActivityType.BADGE_EARNED, related_object=self.bob
        )
        item2 = record_activity(
            user=self.bob, activity_type=ActivityType.BADGE_EARNED, related_object=self.bob
        )
        self.assertEqual(item1.id, item2.id)
        self.assertEqual(ActivityItem.objects.count(), 1)

    def test_feed_only_shows_followed_users(self):
        follow_user(follower=self.alice, target=self.bob)
        bob_item = record_activity(user=self.bob, activity_type=ActivityType.STREAK_MILESTONE, value=7)
        record_activity(user=self.carol, activity_type=ActivityType.STREAK_MILESTONE, value=3)

        feed_ids = list(get_feed(user=self.alice).values_list("id", flat=True))
        self.assertEqual(feed_ids, [bob_item.id])

    def test_feed_is_newest_first(self):
        follow_user(follower=self.alice, target=self.bob)
        first = record_activity(user=self.bob, activity_type=ActivityType.STREAK_MILESTONE, value=3)
        second = record_activity(user=self.bob, activity_type=ActivityType.STREAK_MILESTONE, value=7)

        feed_ids = list(get_feed(user=self.alice).values_list("id", flat=True))
        self.assertEqual(feed_ids, [second.id, first.id])


class FollowApiTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            email="alice3@example.com", password="SuperSecret123!", username="alice3"
        )
        self.bob = User.objects.create_user(
            email="bob3@example.com", password="SuperSecret123!", username="bob3"
        )
        self.client.force_authenticate(self.alice)

    def test_follow_and_unfollow_via_api(self):
        response = self.client.post(f"/api/v1/users/{self.bob.username}/follow/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Follow.objects.filter(follower=self.alice, following=self.bob).exists())

        response = self.client.delete(f"/api/v1/users/{self.bob.username}/follow/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Follow.objects.filter(follower=self.alice, following=self.bob).exists())

    def test_followers_and_following_lists(self):
        self.client.post(f"/api/v1/users/{self.bob.username}/follow/")

        followers = self.client.get(f"/api/v1/users/{self.bob.username}/followers/")
        self.assertEqual([u["username"] for u in followers.data["results"]], [self.alice.username])

        following = self.client.get(f"/api/v1/users/{self.alice.username}/following/")
        self.assertEqual([u["username"] for u in following.data["results"]], [self.bob.username])

    def test_public_profile_reflects_follow_state(self):
        response = self.client.get(f"/api/v1/users/{self.bob.username}/")
        self.assertFalse(response.data["is_following"])
        self.assertEqual(response.data["follower_count"], 0)

        self.client.post(f"/api/v1/users/{self.bob.username}/follow/")

        response = self.client.get(f"/api/v1/users/{self.bob.username}/")
        self.assertTrue(response.data["is_following"])
        self.assertEqual(response.data["follower_count"], 1)

    def test_feed_endpoint_returns_followed_users_activity(self):
        self.client.post(f"/api/v1/users/{self.bob.username}/follow/")
        record_activity(user=self.bob, activity_type=ActivityType.STREAK_MILESTONE, value=7)

        response = self.client.get("/api/v1/me/feed/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["summary"], "reached a 7-day streak")
