"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Flame, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptGymStaffInvite, previewGymStaffInvite } from "@/lib/api/gym-manage";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { GymStaffInvitePreview } from "@/types/api";

const ROLE_LABEL: Record<string, string> = { staff: "Staff", manager: "Manager", owner: "Owner" };

export default function StaffInviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { user, loading: userLoading } = useCurrentUser();

  const [preview, setPreview] = useState<GymStaffInvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    previewGymStaffInvite(token)
      .then(setPreview)
      .catch((err) => {
        setPreviewError(
          err instanceof ApiError ? err.message : "This invite link is invalid or has expired."
        );
      });
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptGymStaffInvite(token);
      setAccepted(true);
    } catch (err) {
      setAcceptError(
        err instanceof ApiError ? err.message : "Couldn't accept this invite. Try again."
      );
    } finally {
      setAccepting(false);
    }
  };

  const nextParam = `/staff-invites/${token}`;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-6 sm:px-8">
        <Link href="/" className="flex w-fit items-center gap-1.5 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
            <Flame className="size-3.5" />
          </span>
          GymStreak
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Gym staff invite</CardTitle>
              {preview ? (
                <CardDescription>
                  You&apos;ve been invited to join <strong>{preview.gym.name}</strong> as{" "}
                  {ROLE_LABEL[preview.role] ?? preview.role}.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {previewError ? (
                <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
                  <AlertDescription className="text-current">{previewError}</AlertDescription>
                </Alert>
              ) : !preview ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : accepted ? (
                <Alert className="border-success/25 bg-success/5 text-success">
                  <CheckCircle2 className="size-4" />
                  <AlertDescription className="text-current">
                    You&apos;re in! You now have {ROLE_LABEL[preview.role] ?? preview.role} access
                    at {preview.gym.name}.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Sent to <span className="text-foreground">{preview.email}</span>
                  </p>
                  {acceptError ? (
                    <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
                      <AlertDescription className="text-current">{acceptError}</AlertDescription>
                    </Alert>
                  ) : null}
                </>
              )}
            </CardContent>
            {preview && !previewError ? (
              <CardFooter className="flex-col items-stretch gap-3">
                {accepted ? (
                  <Button
                    variant="gradient"
                    render={<Link href={`/gyms/${preview.gym.id}/manage`} />}
                  >
                    Go to gym management
                  </Button>
                ) : userLoading ? (
                  <Button variant="gradient" disabled>
                    <Loader2 className="animate-spin" />
                    Loading…
                  </Button>
                ) : !user ? (
                  <>
                    <Button
                      variant="gradient"
                      render={<Link href={`/register?next=${encodeURIComponent(nextParam)}`} />}
                    >
                      Create an account to accept
                    </Button>
                    <Button
                      variant="outline"
                      render={<Link href={`/login?next=${encodeURIComponent(nextParam)}`} />}
                    >
                      Log in to accept
                    </Button>
                  </>
                ) : (
                  <Button variant="gradient" onClick={handleAccept} disabled={accepting}>
                    {accepting ? <Loader2 className="animate-spin" /> : null}
                    Accept invite as {user.email}
                  </Button>
                )}
              </CardFooter>
            ) : null}
          </Card>
        </div>
      </main>
    </div>
  );
}
