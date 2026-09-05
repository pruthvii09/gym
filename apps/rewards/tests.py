from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audit.models import AuditLog
from apps.rewards.models import (
    InventoryTransaction,
    Product,
    ProductVariant,
    RewardClaim,
    RewardDefinition,
    RewardStatus,
    UserReward,
)
from apps.users.models import User


class AdminRewardsTestBase(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="staff@example.com", password="StaffPass123!", is_staff=True
        )
        self.member = User.objects.create_user(
            email="member@example.com", password="MemberPass123!"
        )
        self.product = Product.objects.create(name="Hoodie", sku="HOODIE-1")
        self.variant = ProductVariant.objects.create(product=self.product, size="M", stock=0)
        self.reward_definition = RewardDefinition.objects.create(
            name="30-Day Hoodie", required_streak=30, product=self.product
        )

    def auth_as(self, user):
        self.client.force_authenticate(user=user)


class AdminAuthorizationTests(AdminRewardsTestBase):
    def test_non_staff_is_forbidden_from_admin_endpoints(self):
        self.auth_as(self.member)
        response = self.client.get("/api/v1/admin/products/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_is_rejected(self):
        response = self.client.get("/api/v1/admin/products/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_can_access_admin_endpoints(self):
        self.auth_as(self.staff)
        response = self.client.get("/api/v1/admin/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class AdminInventoryTests(AdminRewardsTestBase):
    def test_restock_increases_stock_and_writes_ledger_entry(self):
        self.auth_as(self.staff)
        response = self.client.post(
            f"/api/v1/admin/product-variants/{self.variant.id}/restock/",
            {"quantity": 10, "reference": "PO-1"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 10)

        txn = InventoryTransaction.objects.get(variant=self.variant, type=InventoryTransaction.Type.RESTOCK)
        self.assertEqual(txn.quantity, 10)

        self.assertTrue(
            AuditLog.objects.filter(action="inventory.restock", entity_id=str(self.variant.id)).exists()
        )

    def test_adjust_can_decrease_stock_but_not_below_zero(self):
        self.variant.stock = 5
        self.variant.save(update_fields=["stock"])
        self.auth_as(self.staff)

        response = self.client.post(
            f"/api/v1/admin/product-variants/{self.variant.id}/adjust/",
            {"quantity": -3, "reason": "damaged units"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 2)

        response = self.client.post(
            f"/api/v1/admin/product-variants/{self.variant.id}/adjust/",
            {"quantity": -10, "reason": "damaged units"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 2)  # unchanged after the rejected adjustment

    def test_adjust_requires_a_reason(self):
        self.auth_as(self.staff)
        response = self.client.post(
            f"/api/v1/admin/product-variants/{self.variant.id}/adjust/",
            {"quantity": 3, "reason": ""},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminRewardClaimFulfillmentTests(AdminRewardsTestBase):
    def setUp(self):
        super().setUp()
        self.variant.stock = 5
        self.variant.save(update_fields=["stock"])
        self.user_reward = UserReward.objects.create(
            user=self.member,
            reward_definition=self.reward_definition,
            status=RewardStatus.CLAIMED,
            claimed_at=timezone.now(),
        )
        self.claim = RewardClaim.objects.create(
            user_reward=self.user_reward,
            variant=self.variant,
            shipping_address={"name": "Jane", "line1": "1 Main St", "city": "NYC",
                               "postal_code": "10001", "country": "US"},
            status=RewardStatus.CLAIMED,
        )
        self.auth_as(self.staff)

    def _transition(self, new_status, **extra):
        return self.client.post(
            f"/api/v1/admin/reward-claims/{self.claim.id}/transition/",
            {"status": new_status, **extra},
        )

    def test_valid_transition_chain_claimed_to_delivered(self):
        response = self._transition(RewardStatus.PROCESSING)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], RewardStatus.PROCESSING)

        response = self._transition(
            RewardStatus.SHIPPED, tracking_number="1Z999", carrier="UPS"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tracking_number"], "1Z999")
        self.assertEqual(response.data["carrier"], "UPS")
        self.assertIsNotNone(response.data["shipped_at"])

        self.claim.refresh_from_db()
        self.assertTrue(
            InventoryTransaction.objects.filter(
                variant=self.variant, type=InventoryTransaction.Type.SHIP, reference=str(self.claim.id)
            ).exists()
        )

        response = self._transition(RewardStatus.DELIVERED)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["delivered_at"])

        self.user_reward.refresh_from_db()
        self.assertEqual(self.user_reward.status, RewardStatus.DELIVERED)

    def test_invalid_transition_is_rejected(self):
        # CLAIMED -> DELIVERED is not a valid direct transition.
        response = self._transition(RewardStatus.DELIVERED)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, RewardStatus.CLAIMED)

    def test_cannot_cancel_after_shipped(self):
        self._transition(RewardStatus.PROCESSING)
        self._transition(RewardStatus.SHIPPED)

        response = self._transition(RewardStatus.CANCELLED)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancel_before_shipping_releases_inventory(self):
        stock_before = ProductVariant.objects.get(pk=self.variant.pk).stock

        response = self._transition(RewardStatus.CANCELLED, reason="member requested")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, stock_before + 1)
        self.assertTrue(
            InventoryTransaction.objects.filter(
                variant=self.variant, type=InventoryTransaction.Type.RELEASE, reference=str(self.claim.id)
            ).exists()
        )

    def test_transition_is_audit_logged(self):
        self._transition(RewardStatus.PROCESSING, reason="staff started fulfillment")
        log = AuditLog.objects.filter(
            action="reward_claim.status_transition", entity_id=str(self.claim.id)
        ).latest("created_at")
        self.assertEqual(log.actor, self.staff)
        self.assertEqual(log.previous_state["status"], RewardStatus.CLAIMED)
        self.assertEqual(log.new_state["status"], RewardStatus.PROCESSING)
        self.assertEqual(log.reason, "staff started fulfillment")

    def test_non_staff_cannot_transition_claims(self):
        self.auth_as(self.member)
        response = self._transition(RewardStatus.PROCESSING)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
