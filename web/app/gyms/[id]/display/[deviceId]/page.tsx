"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getGym } from "@/lib/api/gyms";
import { getGymDeviceQr, listGymDevices } from "@/lib/api/gym-manage";
import { ApiError } from "@/lib/api/client";
import type { GymDevice, GymSummary } from "@/types/api";

const QR_REFRESH_MS = 20_000; // well under the 30s server-side TTL
const QR_IMAGE_SIZE = 360;

export default function GymDeviceDisplayPage() {
  const router = useRouter();
  const params = useParams<{ id: string; deviceId: string }>();
  const gymId = params.id;
  const deviceId = params.deviceId;
  const { user, loading: userLoading } = useCurrentUser();

  const [gym, setGym] = useState<GymSummary | null>(null);
  const [device, setDevice] = useState<GymDevice | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/gyms/${gymId}/display/${deviceId}`)}`);
      return;
    }
    Promise.all([getGym(gymId), listGymDevices(gymId)])
      .then(([gymRes, devicesRes]) => {
        setGym(gymRes);
        const match = devicesRes.results.find((d) => d.id === deviceId);
        if (!match) {
          setNotFound(true);
          return;
        }
        setDevice(match);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/dashboard");
          return;
        }
        setNotFound(true);
      });
  }, [userLoading, user, gymId, deviceId, router]);

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    const fetchQr = () => {
      getGymDeviceQr(deviceId)
        .then(async (res) => {
          const dataUrl = await QRCode.toDataURL(res.token, {
            width: QR_IMAGE_SIZE,
            margin: 1,
            color: { dark: "#18181b", light: "#ffffff" },
          });
          if (cancelled) return;
          setQrImage(dataUrl);
          setExpiresAt(res.expires_at);
          setError(null);
        })
        .catch(() => {
          if (!cancelled) setError("Couldn't refresh the code — retrying…");
        });
    };
    fetchQr();
    const interval = setInterval(fetchQr, QR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [device, deviceId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  if (userLoading || (!device && !notFound)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (notFound || !device) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          This device couldn&apos;t be found, or you don&apos;t have access to it.
        </p>
        <Link
          href={`/gyms/${gymId}/manage/devices`}
          className="text-sm text-primary underline underline-offset-4"
        >
          Back to devices
        </Link>
      </div>
    );
  }

  const secondsLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
    : null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-background to-muted/40 px-6 py-12 text-center">
      <Link
        href={`/gyms/${gymId}/manage/devices`}
        className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Exit display mode
      </Link>

      <div>
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {gym?.name}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Scan to check in</h1>
        <p className="mt-1 text-muted-foreground">{device.name}</p>
      </div>

      <div className="rounded-3xl border border-border bg-white p-6 shadow-lg">
        {qrImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL, not worth next/image's optimizer
          <img
            src={qrImage}
            alt="Check-in QR code"
            width={QR_IMAGE_SIZE}
            height={QR_IMAGE_SIZE}
          />
        ) : (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ width: QR_IMAGE_SIZE, height: QR_IMAGE_SIZE }}
          >
            Loading code…
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5" />
        {error ?? (secondsLeft !== null ? `Refreshes in ${secondsLeft}s` : "Loading…")}
      </div>
    </div>
  );
}
