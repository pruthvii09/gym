from django.urls import path

from apps.rewards.admin_views import (
    AdminInventoryAdjustView,
    AdminInventoryReservedView,
    AdminInventoryRestockView,
    AdminInventoryShippedView,
    AdminInventoryTransactionListView,
    AdminProductDetailView,
    AdminProductListCreateView,
    AdminProductVariantDetailView,
    AdminProductVariantListCreateView,
    AdminRewardClaimDetailView,
    AdminRewardClaimListView,
    AdminRewardClaimTransitionView,
    AdminRewardDefinitionDetailView,
    AdminRewardDefinitionListCreateView,
    AdminShipmentListView,
)

urlpatterns = [
    # Products & inventory
    path("admin/products/", AdminProductListCreateView.as_view(), name="admin-product-list-create"),
    path("admin/products/<uuid:pk>/", AdminProductDetailView.as_view(), name="admin-product-detail"),
    path(
        "admin/product-variants/",
        AdminProductVariantListCreateView.as_view(),
        name="admin-product-variant-list-create",
    ),
    path(
        "admin/product-variants/<uuid:pk>/",
        AdminProductVariantDetailView.as_view(),
        name="admin-product-variant-detail",
    ),
    path(
        "admin/product-variants/<uuid:pk>/restock/",
        AdminInventoryRestockView.as_view(),
        name="admin-inventory-restock",
    ),
    path(
        "admin/product-variants/<uuid:pk>/adjust/",
        AdminInventoryAdjustView.as_view(),
        name="admin-inventory-adjust",
    ),
    path(
        "admin/inventory-transactions/",
        AdminInventoryTransactionListView.as_view(),
        name="admin-inventory-transaction-list",
    ),
    path(
        "admin/inventory/reserved/",
        AdminInventoryReservedView.as_view(),
        name="admin-inventory-reserved",
    ),
    path(
        "admin/inventory/shipped/",
        AdminInventoryShippedView.as_view(),
        name="admin-inventory-shipped",
    ),
    # Rewards
    path(
        "admin/reward-definitions/",
        AdminRewardDefinitionListCreateView.as_view(),
        name="admin-reward-definition-list-create",
    ),
    path(
        "admin/reward-definitions/<uuid:pk>/",
        AdminRewardDefinitionDetailView.as_view(),
        name="admin-reward-definition-detail",
    ),
    # Reward claims / fulfillment
    path("admin/reward-claims/", AdminRewardClaimListView.as_view(), name="admin-reward-claim-list"),
    path(
        "admin/reward-claims/<uuid:pk>/",
        AdminRewardClaimDetailView.as_view(),
        name="admin-reward-claim-detail",
    ),
    path(
        "admin/reward-claims/<uuid:pk>/transition/",
        AdminRewardClaimTransitionView.as_view(),
        name="admin-reward-claim-transition",
    ),
    # Shipping
    path("admin/shipments/", AdminShipmentListView.as_view(), name="admin-shipment-list"),
]
