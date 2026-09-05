from django.urls import path

from apps.rewards.views import (
    MyUserRewardDetailView,
    MyUserRewardListView,
    RewardClaimCreateView,
    RewardDefinitionDetailView,
    RewardDefinitionListView,
)

urlpatterns = [
    path("rewards/", RewardDefinitionListView.as_view(), name="reward-list"),
    path("rewards/<uuid:pk>/", RewardDefinitionDetailView.as_view(), name="reward-detail"),
    path("rewards/<uuid:pk>/claim/", RewardClaimCreateView.as_view(), name="reward-claim"),
    path("me/rewards/", MyUserRewardListView.as_view(), name="my-reward-list"),
    path("me/rewards/<uuid:pk>/", MyUserRewardDetailView.as_view(), name="my-reward-detail"),
]
