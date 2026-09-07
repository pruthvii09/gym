"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/lib/api/notifications";
import { urlBase64ToUint8Array } from "@/lib/notifications/vapid";

export type PushPermission = "unsupported" | NotificationPermission;

// Registers /sw.js and exposes subscribe()/unsubscribe(). Notification.requestPermission()
// is only ever called from subscribe(), i.e. an explicit user action (a button) -- browsers
// penalize/auto-block permission prompts fired on page load.
function readInitialPermission(): PushPermission {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function usePushSubscription() {
  const [permission, setPermission] = useState<PushPermission>(readInitialPermission);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permission === "unsupported") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // registration failing shouldn't break the rest of the page -- subscribe() will
      // surface an error if the user then tries to enable notifications
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = useCallback(async () => {
    if (permission === "unsupported") return;
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const { public_key: vapidPublicKey } = await getVapidPublicKey();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }
      // Always registers, even for a pre-existing browser subscription --
      // re-associates the endpoint with whichever account is logged in now
      // (matters on a shared browser/device).
      await registerPushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        user_agent: navigator.userAgent,
      });
    } catch {
      setError("Couldn't enable notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [permission]);

  const unsubscribe = useCallback(async () => {
    if (permission === "unsupported") return;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unregisterPushSubscription(endpoint);
      }
    } catch {
      setError("Couldn't disable notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [permission]);

  return { permission, busy, error, subscribe, unsubscribe };
}
