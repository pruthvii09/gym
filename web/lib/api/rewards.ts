import { apiFetch } from "@/lib/api/client";
import type {
  ClaimRewardRequest,
  ClaimRewardResult,
  PaginatedResponse,
  Product,
  RedeemPerkResult,
  RewardDefinition,
  RewardProgress,
} from "@/types/api";

export function getMyRewardsOverview() {
  return apiFetch<RewardProgress[]>("/api/v1/me/rewards/overview/", {}, { auth: true });
}

export function getReward(id: string) {
  return apiFetch<RewardDefinition>(`/api/v1/rewards/${id}/`, {}, { auth: true });
}

export function claimReward(rewardId: string, payload: ClaimRewardRequest) {
  return apiFetch<ClaimRewardResult>(
    `/api/v1/rewards/${rewardId}/claim/`,
    { method: "POST", body: JSON.stringify(payload) },
    { auth: true }
  );
}

export function redeemPerk(rewardId: string) {
  return apiFetch<RedeemPerkResult>(
    `/api/v1/rewards/${rewardId}/redeem/`,
    { method: "POST" },
    { auth: true }
  );
}

export function listProducts() {
  return apiFetch<PaginatedResponse<Product>>(
    "/api/v1/products/?page_size=100",
    {},
    { auth: true }
  );
}
