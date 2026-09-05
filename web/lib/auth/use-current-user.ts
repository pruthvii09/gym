"use client";

import { useEffect, useState } from "react";

import { getMe } from "@/lib/api/auth";
import { clearTokens, getAccessToken } from "@/lib/auth/session";
import type { MeResponse } from "@/types/api";

/**
 * Client-side session check: reads the stored access token and, if present,
 * confirms it's still valid against GET /me/ (an expired/blacklisted token
 * is cleared, not trusted just because it's in localStorage).
 *
 * `loading` always starts `true`, identically on the server-rendered markup
 * and the client's first render -- localStorage only exists client-side, so
 * computing it eagerly in a useState initializer would make that first
 * render disagree with SSR and trigger a hydration mismatch. The real check
 * only happens after mount, inside the effect below, and `loading` only
 * ever flips inside an async continuation (never synchronously in the
 * effect body) so both branches resolve the same way.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();

    const resolved = token
      ? getMe()
          .then((me) => {
            if (!cancelled) setUser(me);
          })
          .catch(() => {
            clearTokens();
          })
      : Promise.resolve();

    resolved.finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
