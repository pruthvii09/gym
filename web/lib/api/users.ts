import { apiFetch } from "@/lib/api/client";
import type { PublicProfile, UserSearchResult } from "@/types/api";

export function getPublicProfile(username: string) {
  return apiFetch<PublicProfile>(
    `/api/v1/users/${encodeURIComponent(username)}/`,
    {},
    { auth: true }
  );
}

export function searchUsers(query: string) {
  return apiFetch<UserSearchResult[]>(
    `/api/v1/users/search/?q=${encodeURIComponent(query)}`,
    {},
    { auth: true }
  );
}
