"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import jsQR from "jsqr";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Flame,
  Gift,
  Hourglass,
  KeyRound,
  Loader2,
  MapPin,
  Trophy,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { createCheckin } from "@/lib/api/checkins";
import { ApiError } from "@/lib/api/client";
import type { CreateCheckinResult } from "@/types/api";

type Status =
  | "idle"
  | "scanning"
  | "camera-error"
  | "locating"
  | "location-error"
  | "submitting"
  | "success"
  | "review"
  | "error";

export default function CheckinPage() {
  const router = useRouter();
  const { user: me, loading } = useCurrentUser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CreateCheckinResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualToken, setManualToken] = useState("");

  useEffect(() => {
    if (!loading && !me) {
      router.replace(`/login?next=${encodeURIComponent("/checkin")}`);
    }
  }, [loading, me, router]);

  const submitToken = (token: string) => {
    if (!me?.gym) return;
    setStatus("locating");
    setMessage(null);

    if (!("geolocation" in navigator)) {
      setStatus("location-error");
      setMessage("This device doesn't support location — can't verify you're at the gym.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus("submitting");
        createCheckin({
          gym_id: me.gym!.id,
          qr_token: token,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          location_accuracy: Math.round(position.coords.accuracy),
          platform: "web",
        })
          .then((res) => {
            setStatus(
              res.status === "verified" ? "success" : res.status === "review" ? "review" : "error"
            );
            setMessage(res.message);
            setResult(res);
          })
          .catch((err) => {
            setStatus("error");
            setMessage(err instanceof ApiError ? err.message : "Couldn't submit your check-in.");
          });
      },
      (geoError) => {
        setStatus("location-error");
        setMessage(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location access was denied — allow it to verify you're at the gym."
            : "Couldn't get your location. Try again."
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  useEffect(() => {
    if (status !== "scanning") return;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            stopped = true;
            stream?.getTracks().forEach((t) => t.stop());
            submitToken(code.data);
            return;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
        tick();
      })
      .catch(() => {
        if (!stopped) setStatus("camera-error");
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const reset = () => {
    setStatus("idle");
    setMessage(null);
    setResult(null);
    setManualToken("");
  };

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10">
        {!me.gym ? (
          <Card>
            <CardContent className="space-y-2 py-8 text-center">
              <p className="font-medium">No home gym yet</p>
              <p className="text-sm text-muted-foreground">
                You need a home gym before you can check in. Ask your gym for an invite, or
                register with one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Check in</h1>
              <p className="mt-1 text-muted-foreground">{me.gym.name}</p>
            </div>

            {status === "idle" ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Camera className="size-6" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Scan the check-in code shown at the front desk.
                  </p>
                  <Button variant="gradient" onClick={() => setStatus("scanning")}>
                    <Camera />
                    Start scanning
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {status === "scanning" ? (
              <Card className="overflow-hidden p-0">
                <div className="relative aspect-square w-full bg-black">
                  <video ref={videoRef} className="size-full object-cover" muted playsInline />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
                </div>
                <CardContent className="py-3 text-center">
                  <p className="text-sm text-muted-foreground">Point your camera at the code…</p>
                </CardContent>
              </Card>
            ) : null}

            {status === "camera-error" ? (
              <Card>
                <CardContent className="space-y-3 py-8 text-center">
                  <XCircle className="mx-auto size-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">
                    Couldn&apos;t access your camera. Check your browser permissions, or enter the
                    code manually below.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setStatus("scanning")}>
                    Try camera again
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {status === "locating" ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                  <MapPin className="size-6 animate-pulse text-primary" />
                  <p className="text-sm text-muted-foreground">Confirming your location…</p>
                </CardContent>
              </Card>
            ) : null}

            {status === "location-error" ? (
              <Card>
                <CardContent className="space-y-3 py-8 text-center">
                  <MapPin className="mx-auto size-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">{message}</p>
                  <Button variant="outline" size="sm" onClick={reset}>
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {status === "submitting" ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Checking in…</p>
                </CardContent>
              </Card>
            ) : null}

            {status === "success" ? (
              <div className="space-y-3">
                <Card className="border-success/25 bg-success/5">
                  <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                    <CheckCircle2 className="size-10 text-success" />
                    <p className="font-medium text-success">{message}</p>

                    {result?.streak ? (
                      <div className="flex flex-col items-center gap-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <Flame className="size-7 text-primary" />
                          <span className="text-3xl leading-none font-bold tracking-tight">
                            {result.streak.current_streak}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            day{result.streak.current_streak === 1 ? "" : "s"}
                          </span>
                        </div>
                        {result.streak.current_streak > 0 &&
                        result.streak.current_streak === result.streak.longest_streak ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-warning/25 bg-warning/10 text-warning"
                          >
                            <Trophy className="size-3.5" />
                            Personal best
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      render={<Link href="/dashboard" />}
                    >
                      Back to dashboard
                    </Button>
                  </CardContent>
                </Card>

                {result?.rewards_unlocked && result.rewards_unlocked.length > 0 ? (
                  <Card className="border-warning/25 bg-warning/5">
                    <CardContent className="space-y-3 py-5">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                        <Gift className="size-4" />
                        {result.rewards_unlocked.length === 1
                          ? "You just unlocked a reward!"
                          : `You just unlocked ${result.rewards_unlocked.length} rewards!`}
                      </p>
                      <ul className="space-y-2">
                        {result.rewards_unlocked.map((ur) => (
                          <li
                            key={ur.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                          >
                            <span className="text-sm font-medium">{ur.reward_definition.name}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  href={
                                    ur.reward_definition.reward_type === "perk"
                                      ? "/dashboard"
                                      : `/rewards/${ur.reward_definition.id}/claim`
                                  }
                                />
                              }
                            >
                              {ur.reward_definition.reward_type === "perk" ? "Redeem" : "Claim"}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {status === "review" ? (
              <Card className="border-warning/25 bg-warning/5">
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                  <Hourglass className="size-10 text-warning" />
                  <p className="font-medium text-warning">{message}</p>
                  <p className="text-sm text-muted-foreground">
                    We&apos;re double-checking this one — it doesn&apos;t count toward your streak
                    until it&apos;s approved. We&apos;ll notify you once it&apos;s reviewed.
                  </p>
                  <Button variant="outline" size="sm" render={<Link href="/dashboard" />}>
                    Back to dashboard
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {status === "error" ? (
              <Card className="border-destructive/25 bg-destructive/5">
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                  <XCircle className="size-10 text-destructive" />
                  <p className="text-sm text-destructive">{message}</p>
                  <Button variant="outline" size="sm" onClick={reset}>
                    Try again
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {status === "idle" || status === "camera-error" ? (
              <div>
                <button
                  type="button"
                  onClick={() => setManualOpen((v) => !v)}
                  className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <KeyRound className="size-3.5" />
                  {manualOpen ? "Hide manual entry" : "Enter code manually instead"}
                </button>
                {manualOpen ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <div className="space-y-1.5 sm:flex-1">
                      <Label htmlFor="manual-token" className="sr-only">
                        Check-in code
                      </Label>
                      <Input
                        id="manual-token"
                        placeholder="Paste the check-in code"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={() => submitToken(manualToken.trim())}
                      disabled={!manualToken.trim()}
                    >
                      Submit
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
