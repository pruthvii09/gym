"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

// `useSyncExternalStore` (rather than a useState+useEffect pair) so
// `matches` is never wrong-then-corrected via a post-mount setState --
// getServerSnapshot returns `false` since `matchMedia` doesn't exist
// server-side, fine for "does this need a mobile-specific layout" checks
// where a one-frame desktop-default flash before hydration settles is a
// non-issue (e.g. sheets/dialogs that only mount once opened).
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false
  );
}
