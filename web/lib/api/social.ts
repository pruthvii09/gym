import { apiFetch } from "@/lib/api/client";
import type { ActivityItem, PaginatedResponse, UserSearchResult } from "@/types/api";

export function followUser(username: string) {
  return apiFetch<{ following: boolean; created: boolean }>(
    `/api/v1/users/${encodeURIComponent(username)}/follow/`,
    { method: "POST" },
    { auth: true }
  );
}

export function unfollowUser(username: string) {
  return apiFetch<{ following: boolean }>(
    `/api/v1/users/${encodeURIComponent(username)}/follow/`,
    { method: "DELETE" },
    { auth: true }
  );
}

export function getFollowers(username: string) {
  return apiFetch<PaginatedResponse<UserSearchResult>>(
    `/api/v1/users/${encodeURIComponent(username)}/followers/`,
    {},
    { auth: true }
  );
}

export function getFollowing(username: string) {
  return apiFetch<PaginatedResponse<UserSearchResult>>(
    `/api/v1/users/${encodeURIComponent(username)}/following/`,
    {},
    { auth: true }
  );
}

export function getFeed(page = 1) {
  return apiFetch<PaginatedResponse<ActivityItem>>(
    `/api/v1/me/feed/?page=${page}`,
    {},
    { auth: true }
  );
}
