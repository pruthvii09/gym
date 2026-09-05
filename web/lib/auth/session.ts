const ACCESS_KEY = "gymstreak_access";
const REFRESH_KEY = "gymstreak_refresh";

// localStorage, not an httpOnly cookie -- this is a client-only SPA talking
// directly to the Django API with no server-side proxy, so there's nowhere
// to set an httpOnly cookie from. Acceptable for this dev-phase build; a
// production hardening pass would move token storage behind a BFF.

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
