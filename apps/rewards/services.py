"""Business logic for rewards, claims, and inventory.

CORE RULE: reward eligibility and claim outcomes are always computed here
from stored data -- never trust a client-asserted streak or reward status.
"""

import hashlib
import secrets
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.forms.models import model_to_dict
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit import services as audit_services
from apps.fraud.models import FraudReview
from apps.notifications.tasks import send_reward_shipped_notification, send_reward_unlocked_notification
from apps.rewards.models import (
    InventoryTransaction,
    Product,
    ProductVariant,
    RewardClaim,
    RewardDefinition,
    RewardStatus,
    UserReward,
)

CLAIM_CODE_ENTROPY_BYTES = 32

ACCOUNT_NOT_ELIGIBLE_MSG = "Your account is not eligible to claim rewards at this time."
NOT_EARNED_MSG = "You have not earned this reward."
NO_LONGER_AVAILABLE_MSG = "This reward is no longer available to claim."
OUT_OF_STOCK_MSG = "This item is currently out of stock."
INVALID_VARIANT_MSG = "Invalid variant."
VARIANT_MISMATCH_MSG = "This variant is not available for this reward."
EMAIL_NOT_VERIFIED_MSG = "Please verify your email address before claiming this reward."
PHONE_NOT_VERIFIED_MSG = "Please verify your phone number before claiming this reward."
ACCOUNT_TOO_NEW_MSG = "Your account is too new to claim this reward yet."
INSUFFICIENT_CHECKINS_MSG = "You need more verified check-ins to claim this reward."


def _generate_redemption_code() -> str:
    return secrets.token_urlsafe(CLAIM_CODE_ENTROPY_BYTES)


def _hash_redemption_code(raw: str) -> str:
    # High-entropy bearer credential, not a low-entropy human code -- same
    # reasoning as apps.gyms.tokens.hash_raw_value. Duplicated here
    # deliberately rather than imported: a few lines, no cross-domain
    # coupling justified for a hobby project with only two such uses.
    return hashlib.sha256(raw.encode()).hexdigest()


@dataclass
class ClaimResult:
    claim: RewardClaim
    created: bool  # False => idempotent replay (view returns 200)
    redemption_code: str | None  # None on replay -- shown exactly once


def evaluate_rewards(user, streak):
    """Create a new EARNED UserReward for every ACTIVE RewardDefinition the
    user newly qualifies for, given streak.current_streak.

    Must be called from inside the caller's already-open transaction (does
    not open its own). Currently only called from
    apps.streaks.services.rebuild_user_streak, so every streak recompute
    path (live check-in, rebuild_streaks command, admin bulk action)
    evaluates rewards consistently.

    Idempotent via UserReward's unique_together(user, reward_definition):
    an already-earned reward is never re-created or touched again, even if
    the streak later drops below required_streak -- milestones are sticky,
    never clawed back.
    """
    candidates = RewardDefinition.objects.filter(
        status=RewardDefinition.Status.ACTIVE,
        required_streak__lte=streak.current_streak,
    ).exclude(user_rewards__user=user)

    created = []
    for reward_definition in candidates:
        user_reward, was_created = UserReward.objects.get_or_create(
            user=user,
            reward_definition=reward_definition,
            defaults={"earned_at": timezone.now(), "status": RewardStatus.EARNED},
        )
        if was_created:
            created.append(user_reward)
            # ur_id=user_reward.id as a default argument captures the value
            # at THIS iteration -- a bare `lambda: ...delay(user_reward.id)`
            # would have every callback reference whatever user_reward is
            # bound to by the time on_commit fires after the whole loop
            # finishes, not its value at each iteration.
            transaction.on_commit(
                lambda ur_id=user_reward.id: send_reward_unlocked_notification.delay(
                    user_reward_id=ur_id
                )
            )
    return created


def _check_reward_protection(user, reward_definition):
    """Reward protection gates. user.is_active and block_if_high_risk_review
    both raise the same generic message -- these are fraud-sensitive and
    must not leak which check tripped. The 4 opt-in eligibility gates get
    specific, actionable messages -- telling a legitimate user what they
    still need to do is helpful UX, not an information leak.

    Runs for every claim regardless of tier config: is_active and the
    fraud-review query always execute; the 4 opt-in gates each short-circuit
    on their own falsy default, so unconfigured tiers behave unchanged.
    """
    if not user.is_active:
        raise PermissionDenied(ACCOUNT_NOT_ELIGIBLE_MSG)

    if reward_definition.require_email_verified and not user.email_verified:
        raise PermissionDenied(EMAIL_NOT_VERIFIED_MSG)
    if reward_definition.require_phone_verified and not user.phone_verified:
        raise PermissionDenied(PHONE_NOT_VERIFIED_MSG)

    if reward_definition.minimum_account_age_days:
        age_days = (timezone.now() - user.created_at).days
        if age_days < reward_definition.minimum_account_age_days:
            raise PermissionDenied(ACCOUNT_TOO_NEW_MSG)

    if reward_definition.minimum_verified_checkins:
        from apps.checkins.models import CheckIn

        verified_count = CheckIn.objects.filter(
            user=user, status=CheckIn.Status.VERIFIED
        ).count()
        if verified_count < reward_definition.minimum_verified_checkins:
            raise PermissionDenied(INSUFFICIENT_CHECKINS_MSG)

    if reward_definition.block_if_high_risk_review:
        blocked = FraudReview.objects.filter(
            user=user,
            status=FraudReview.Status.OPEN,
            risk_level=FraudReview.RiskLevel.HIGH,
        ).exists()
        if blocked:
            raise PermissionDenied(ACCOUNT_NOT_ELIGIBLE_MSG)


def claim_reward(*, user, reward_definition, variant_id, address) -> ClaimResult:
    """The 'user claims reward' through 'commit' portion of the flow.

    Locking discipline: UserReward locked first (serializes concurrent
    claim attempts for the SAME user+reward before any inventory work),
    then ProductVariant (serializes stock decrements across DIFFERENT
    users racing for the same variant) -- always this order, one
    transaction.atomic() spanning through RewardClaim creation. Fixed
    ordering everywhere in this module is what rules out deadlock.
    """
    _check_reward_protection(user, reward_definition)

    with transaction.atomic():
        user_reward = (
            UserReward.objects.select_for_update()
            .filter(user=user, reward_definition=reward_definition)
            .first()
        )
        if user_reward is None:
            raise PermissionDenied(NOT_EARNED_MSG)

        # Idempotent-replay short-circuit, under the lock, before any
        # further validation -- a replay of an already-successful claim
        # must succeed even if e.g. a fraud flag landed afterward.
        existing_claim = RewardClaim.objects.filter(user_reward=user_reward).first()
        if existing_claim is not None:
            return ClaimResult(claim=existing_claim, created=False, redemption_code=None)

        if user_reward.status != RewardStatus.EARNED:
            # Only reachable for CANCELLED (terminal, no re-claim this phase).
            raise ValidationError(NO_LONGER_AVAILABLE_MSG)

        variant = ProductVariant.objects.filter(pk=variant_id).first()
        if variant is None:
            raise ValidationError(INVALID_VARIANT_MSG)
        if variant.product_id != reward_definition.product_id:
            raise ValidationError(VARIANT_MISMATCH_MSG)

        variant = ProductVariant.objects.select_for_update().get(pk=variant.pk)
        if variant.stock <= 0:
            raise ValidationError(OUT_OF_STOCK_MSG)

        return _finalize_claim(user_reward=user_reward, variant=variant, address=address)


def _finalize_claim(*, user_reward, variant, address) -> ClaimResult:
    """Single mandatory exit point for a successful reservation. Wraps the
    reserve+create sequence in a savepoint exactly like
    apps.checkins.services._persist, so a same-user_reward race loser
    (should be unreachable given the UserReward lock above -- defense in
    depth only) catches IntegrityError on the OneToOneField and returns the
    winner's claim instead of a 500 or a stock leak.
    """
    plaintext_code = _generate_redemption_code()
    try:
        with transaction.atomic():
            variant.stock -= 1
            variant.save(update_fields=["stock", "updated_at"])

            claim = RewardClaim.objects.create(
                user_reward=user_reward,
                variant=variant,
                shipping_address=address,
                status=RewardStatus.CLAIMED,
            )
            InventoryTransaction.objects.create(
                variant=variant,
                quantity=-1,
                type=InventoryTransaction.Type.RESERVE,
                reference=str(claim.id),
            )
    except IntegrityError:
        claim = RewardClaim.objects.get(user_reward=user_reward)
        return ClaimResult(claim=claim, created=False, redemption_code=None)

    user_reward.status = RewardStatus.CLAIMED
    user_reward.claimed_at = timezone.now()
    user_reward.claim_code_hash = _hash_redemption_code(plaintext_code)
    user_reward.save(update_fields=["status", "claimed_at", "claim_code_hash", "updated_at"])

    return ClaimResult(claim=claim, created=True, redemption_code=plaintext_code)


def sync_user_reward_status(claim):
    """Mirror claim.status onto its UserReward. Called only from
    RewardClaimAdmin on admin-driven status transitions -- not called from
    claim_reward/_finalize_claim, which already set both fields directly at
    creation time. Low-contention admin path; a plain filtered .update() is
    sufficient, no lock needed.
    """
    UserReward.objects.filter(pk=claim.user_reward_id).update(
        status=claim.status, updated_at=timezone.now()
    )


def cancel_claim(claim, *, actor=None, reason=""):
    """Cancellation: releases the reserved unit back to stock via a RELEASE
    transaction, marks both RewardClaim and UserReward CANCELLED. Terminal --
    no re-claim path in this phase. `actor`/`reason` are optional so this
    stays callable from contexts with no admin identity to attribute (kept
    for backward compatibility with existing call sites); the admin API
    always supplies both via transition_claim_status below.
    """
    with transaction.atomic():
        variant = ProductVariant.objects.select_for_update().get(pk=claim.variant_id)
        variant.stock += 1
        variant.save(update_fields=["stock", "updated_at"])
        InventoryTransaction.objects.create(
            variant=variant,
            quantity=1,
            type=InventoryTransaction.Type.RELEASE,
            reference=str(claim.id),
        )
        previous_status = claim.status
        claim.status = RewardStatus.CANCELLED
        claim.save(update_fields=["status", "updated_at"])
        sync_user_reward_status(claim)

    audit_services.record(
        actor=actor,
        action="reward_claim.status_transition",
        entity=claim,
        previous_state={"status": previous_status},
        new_state={"status": claim.status},
        reason=reason,
    )
    return claim


def restock_variant(*, variant, quantity, reference="", actor=None, reason=""):
    """Incremental restock -- same locked read-modify-write pattern as the
    hot-path claim reservation."""
    with transaction.atomic():
        variant = ProductVariant.objects.select_for_update().get(pk=variant.pk)
        previous_stock = variant.stock
        variant.stock += quantity
        variant.save(update_fields=["stock", "updated_at"])
        InventoryTransaction.objects.create(
            variant=variant,
            quantity=quantity,
            type=InventoryTransaction.Type.RESTOCK,
            reference=reference,
        )

    audit_services.record(
        actor=actor,
        action="inventory.restock",
        entity=variant,
        previous_state={"stock": previous_stock},
        new_state={"stock": variant.stock},
        reason=reason,
    )
    return variant


def adjust_inventory(*, variant, quantity, reference="", actor=None, reason):
    """General-purpose stock correction (positive or negative), distinct
    from restock_variant: a restock always means "more stock arrived"
    (positive, RESTOCK-typed); an adjustment is a reconciliation --
    inventory audit correction, damaged/lost goods, etc -- and can go either
    direction, ADJUSTMENT-typed so the ledger keeps the two meanings apart.
    `reason` is required (not optional, unlike restock): an unexplained
    manual stock correction is exactly the kind of change an audit trail
    exists to prevent.
    """
    if quantity == 0:
        raise ValidationError("Adjustment quantity must not be zero.")

    with transaction.atomic():
        variant = ProductVariant.objects.select_for_update().get(pk=variant.pk)
        previous_stock = variant.stock
        new_stock = previous_stock + quantity
        if new_stock < 0:
            raise ValidationError("Adjustment would take stock below zero.")
        variant.stock = new_stock
        variant.save(update_fields=["stock", "updated_at"])
        InventoryTransaction.objects.create(
            variant=variant,
            quantity=quantity,
            type=InventoryTransaction.Type.ADJUSTMENT,
            reference=reference,
        )

    audit_services.record(
        actor=actor,
        action="inventory.adjust",
        entity=variant,
        previous_state={"stock": previous_stock},
        new_state={"stock": variant.stock},
        reason=reason,
    )
    return variant


def rebuild_variant_stock(variant):
    """Audit/repair helper mirroring rebuild_user_streak's role: recompute
    stock as the full sum of this variant's InventoryTransaction ledger.
    Not on any hot path -- manual reconciliation only.
    """
    with transaction.atomic():
        variant = ProductVariant.objects.select_for_update().get(pk=variant.pk)
        total = variant.transactions.aggregate(total=Sum("quantity"))["total"] or 0
        variant.stock = total
        variant.save(update_fields=["stock", "updated_at"])
    return variant


def reserved_inventory_summary():
    """Units currently reserved (claimed but not yet shipped) per variant --
    RewardClaims in CLAIMED/PROCESSING have already decremented ProductVariant.stock
    via a RESERVE transaction, but haven't left the building yet.
    """
    return (
        RewardClaim.objects.filter(status__in=[RewardStatus.CLAIMED, RewardStatus.PROCESSING])
        .values("variant_id", "variant__product__name", "variant__size")
        .annotate(reserved_count=Count("id"))
        .order_by("variant__product__name", "variant__size")
    )


def shipped_inventory_summary():
    """Units that have left the building per variant -- RewardClaims in
    SHIPPED/DELIVERED. Not tracked as a running stock counter (ship is a 0
    quantity ledger marker, per InventoryTransaction.Type.SHIP): this is a
    read-time aggregate over current claim status, not a cache.
    """
    return (
        RewardClaim.objects.filter(status__in=[RewardStatus.SHIPPED, RewardStatus.DELIVERED])
        .values("variant_id", "variant__product__name", "variant__size")
        .annotate(shipped_count=Count("id"))
        .order_by("variant__product__name", "variant__size")
    )


# --- Fulfillment state machine ----------------------------------------------
# The only valid transitions a RewardClaim can make. CANCELLED is reachable
# only before a unit has actually left the building (CLAIMED/PROCESSING) --
# once SHIPPED, cancellation isn't a status flip, it's a real-world return
# process this phase doesn't model. DELIVERED and CANCELLED are terminal.
CLAIM_ALLOWED_TRANSITIONS = {
    RewardStatus.CLAIMED: {RewardStatus.PROCESSING, RewardStatus.CANCELLED},
    RewardStatus.PROCESSING: {RewardStatus.SHIPPED, RewardStatus.CANCELLED},
    RewardStatus.SHIPPED: {RewardStatus.DELIVERED},
}


def transition_claim_status(
    *, actor, claim, new_status, reason="", tracking_number=None, carrier=None
):
    """The single path by which a RewardClaim's fulfillment status changes,
    used by both the admin API and Django admin (RewardClaimAdmin delegates
    here) -- exactly one code path, same discipline as
    apps.streaks.services.rebuild_user_streak. Raises ValidationError for
    any transition not in CLAIM_ALLOWED_TRANSITIONS.
    """
    allowed = CLAIM_ALLOWED_TRANSITIONS.get(claim.status, set())
    if new_status not in allowed:
        raise ValidationError(
            f"Cannot transition a reward claim from '{claim.status}' to '{new_status}'."
        )

    if new_status == RewardStatus.CANCELLED:
        return cancel_claim(claim, actor=actor, reason=reason)

    previous_state = {
        "status": claim.status,
        "tracking_number": claim.tracking_number,
        "carrier": claim.carrier,
    }

    update_fields = ["status", "updated_at"]
    claim.status = new_status
    if tracking_number is not None:
        claim.tracking_number = tracking_number
        update_fields.append("tracking_number")
    if carrier is not None:
        claim.carrier = carrier
        update_fields.append("carrier")

    with transaction.atomic():
        if new_status == RewardStatus.SHIPPED:
            claim.shipped_at = timezone.now()
            update_fields.append("shipped_at")
            # SHIP is a 0-quantity ledger marker (stock already moved at
            # RESERVE time) -- recorded so the ledger shows exactly when
            # every unit shipped, not just when it was reserved.
            InventoryTransaction.objects.create(
                variant_id=claim.variant_id,
                quantity=0,
                type=InventoryTransaction.Type.SHIP,
                reference=str(claim.id),
            )
        elif new_status == RewardStatus.DELIVERED:
            claim.delivered_at = timezone.now()
            update_fields.append("delivered_at")

        claim.save(update_fields=update_fields)
        sync_user_reward_status(claim)

    audit_services.record(
        actor=actor,
        action="reward_claim.status_transition",
        entity=claim,
        previous_state=previous_state,
        new_state={
            "status": claim.status,
            "tracking_number": claim.tracking_number,
            "carrier": claim.carrier,
        },
        reason=reason,
    )

    if new_status == RewardStatus.SHIPPED:
        transaction.on_commit(
            lambda cid=claim.id: send_reward_shipped_notification.delay(claim_id=cid)
        )

    return claim


# --- Admin/operations: products, variants, reward definitions ---------------


def admin_create_product(*, actor, **fields):
    product = Product.objects.create(**fields)
    audit_services.record(
        actor=actor, action="product.create", entity=product, new_state=model_to_dict(product)
    )
    return product


def admin_update_product(*, actor, product, **fields):
    previous_state = model_to_dict(product)
    for field, value in fields.items():
        setattr(product, field, value)
    product.save()
    audit_services.record(
        actor=actor,
        action="product.update",
        entity=product,
        previous_state=previous_state,
        new_state=model_to_dict(product),
    )
    return product


def admin_create_variant(*, actor, product, size, initial_stock=0, reference=""):
    """Stock is never set directly, even at creation -- a nonzero
    initial_stock is recorded as a real RESTOCK ledger transaction so the
    ledger always fully explains the current stock value, no exceptions.
    """
    variant = ProductVariant.objects.create(product=product, size=size, stock=0)
    audit_services.record(
        actor=actor,
        action="product_variant.create",
        entity=variant,
        new_state={"product": str(product.id), "size": variant.size},
    )
    if initial_stock:
        restock_variant(
            variant=variant,
            quantity=initial_stock,
            reference=reference or "initial stock",
            actor=actor,
            reason="Initial stock on variant creation",
        )
        variant.refresh_from_db()
    return variant


def admin_create_reward_definition(*, actor, **fields):
    reward_definition = RewardDefinition.objects.create(**fields)
    audit_services.record(
        actor=actor,
        action="reward_definition.create",
        entity=reward_definition,
        new_state=model_to_dict(reward_definition),
    )
    return reward_definition


def admin_update_reward_definition(*, actor, reward_definition, **fields):
    previous_state = model_to_dict(reward_definition)
    for field, value in fields.items():
        setattr(reward_definition, field, value)
    reward_definition.save()
    audit_services.record(
        actor=actor,
        action="reward_definition.update",
        entity=reward_definition,
        previous_state=previous_state,
        new_state=model_to_dict(reward_definition),
    )
    return reward_definition
