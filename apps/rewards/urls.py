from django.urls import path

from apps.rewards.views import (
    GymRewardDetailView,
    GymRewardListCreateView,
    GymRewardRedemptionVerifyView,
    MyRewardsOverviewView,
    MyUserRewardDetailView,
    MyUserRewardListView,
    ProductListView,
    RewardClaimCreateView,
    RewardDefinitionDetailView,
    RewardDefinitionListView,
    RewardRedeemCreateView,
)

urlpatterns = [
    path("rewards/", RewardDefinitionListView.as_view(), name="reward-list"),
    path("rewards/<uuid:pk>/", RewardDefinitionDetailView.as_view(), name="reward-detail"),
    path("rewards/<uuid:pk>/claim/", RewardClaimCreateView.as_view(), name="reward-claim"),
    path("rewards/<uuid:pk>/redeem/", RewardRedeemCreateView.as_view(), name="reward-redeem"),
    path("me/rewards/", MyUserRewardListView.as_view(), name="my-reward-list"),
    path("me/rewards/overview/", MyRewardsOverviewView.as_view(), name="my-reward-overview"),
    path("me/rewards/<uuid:pk>/", MyUserRewardDetailView.as_view(), name="my-reward-detail"),
    path("products/", ProductListView.as_view(), name="product-list"),
    path(
        "gyms/<uuid:pk>/rewards/",
        GymRewardListCreateView.as_view(),
        name="gym-reward-list-create",
    ),
    path(
        "gyms/<uuid:pk>/rewards/<uuid:reward_id>/",
        GymRewardDetailView.as_view(),
        name="gym-reward-detail",
    ),
    path(
        "gyms/<uuid:pk>/reward-redemptions/verify/",
        GymRewardRedemptionVerifyView.as_view(),
        name="gym-reward-redemption-verify",
    ),
]
