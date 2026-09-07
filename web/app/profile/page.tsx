"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Award, Bell, Calendar, Check, Flame, Loader2, MapPin, Pencil, Search, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BadgeGrid } from "@/components/badges/badge-grid";
import { listMyBadges, setFeaturedBadges } from "@/lib/api/badges";
import { updateProfile } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { usePushSubscription } from "@/lib/notifications/use-push-subscription";
import type { BadgeProgress, MeResponse } from "@/types/api";

const FEATURED_LIMIT = 2;

export default function ProfilePage() {
  const router = useRouter();
  const { user: initialMe, loading: userLoading } = useCurrentUser();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [progress, setProgress] = useState<BadgeProgress[] | null>(null);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);

  const [selectedFeatured, setSelectedFeatured] = useState<Set<string>>(new Set());
  const [savingFeatured, setSavingFeatured] = useState(false);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [featuredSaved, setFeaturedSaved] = useState(false);

  const pushSubscription = usePushSubscription();

  useEffect(() => {
    if (!initialMe) return;
    const timeout = setTimeout(() => {
      setMe(initialMe);
      setUsernameInput(initialMe.username);
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialMe]);

  const loadBadges = () => {
    listMyBadges()
      .then((rows) => {
        setProgress(rows);
        setSelectedFeatured(
          new Set(
            rows
              .filter((r) => r.user_badge?.is_featured)
              .map((r) => r.badge.id)
          )
        );
      })
      .catch(() => setProgress([]));
  };

  useEffect(() => {
    if (!me) return;
    loadBadges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (!userLoading && !initialMe) router.replace(`/login?next=${encodeURIComponent("/profile")}`);
  }, [userLoading, initialMe, router]);

  const handleSaveUsername = async () => {
    setSavingUsername(true);
    setUsernameError(null);
    try {
      const updated = await updateProfile({ username: usernameInput.trim() });
      setMe(updated);
      setEditingUsername(false);
    } catch (err) {
      setUsernameError(
        err instanceof ApiError ? err.fieldError("username") ?? err.message : "Couldn't save."
      );
    } finally {
      setSavingUsername(false);
    }
  };

  const toggleFeatured = (badgeId: string) => {
    setFeaturedSaved(false);
    setSelectedFeatured((prev) => {
      const next = new Set(prev);
      if (next.has(badgeId)) {
        next.delete(badgeId);
      } else {
        if (next.size >= FEATURED_LIMIT) return prev;
        next.add(badgeId);
      }
      return next;
    });
  };

  const handleSaveFeatured = async () => {
    setSavingFeatured(true);
    setFeaturedError(null);
    setFeaturedSaved(false);
    try {
      await setFeaturedBadges(Array.from(selectedFeatured));
      setFeaturedSaved(true);
      loadBadges();
    } catch (err) {
      setFeaturedError(err instanceof ApiError ? err.message : "Couldn't save your featured badges.");
    } finally {
      setSavingFeatured(false);
    }
  };

  if (userLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const displayName = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.username;
  const unlockedCount = progress?.filter((p) => p.user_badge).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <Link
            href="/search"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Search className="size-4" />
            Find people
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:px-8">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-2xl font-bold text-primary-foreground">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{displayName}</p>
                {editingUsername ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">@</span>
                    <Input
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                      className="h-7 max-w-40 text-sm"
                      disabled={savingUsername}
                    />
                    <Button size="sm" className="h-7 px-2" onClick={handleSaveUsername} disabled={savingUsername}>
                      {savingUsername ? <Loader2 className="animate-spin" /> : <Check />}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingUsername(true)}
                    className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    @{me.username}
                    <Pencil className="size-3" />
                  </button>
                )}
                {usernameError ? <p className="mt-1 text-xs text-destructive">{usernameError}</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 border-t border-border/70 pt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {me.gym ? me.gym.name : "No home gym"}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Joined {new Date(me.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <span className="flex items-center gap-1.5">
                <Trophy className="size-3.5" />
                {unlockedCount} badge{unlockedCount === 1 ? "" : "s"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Award className="size-4 text-primary" />
                Badges
              </p>
              <p className="text-xs text-muted-foreground">
                Pick up to {FEATURED_LIMIT} to feature on your profile
              </p>
            </div>

            {progress === null ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <BadgeGrid
                  progress={progress}
                  selectable
                  selectedBadgeIds={selectedFeatured}
                  onToggleSelect={toggleFeatured}
                />

                {featuredError ? <p className="text-xs text-destructive">{featuredError}</p> : null}
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleSaveFeatured} disabled={savingFeatured}>
                    {savingFeatured ? <Loader2 className="animate-spin" /> : null}
                    Save featured badges
                  </Button>
                  {featuredSaved ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="size-3.5" />
                      Saved
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {pushSubscription.permission === "unsupported" ? null : (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="push-toggle" className="flex items-center gap-1.5 text-sm font-medium">
                  <Bell className="size-4 text-primary" />
                  Push notifications
                </label>
                <Switch
                  id="push-toggle"
                  checked={pushSubscription.permission === "granted"}
                  disabled={pushSubscription.busy || pushSubscription.permission === "denied"}
                  onCheckedChange={(checked) =>
                    void (checked ? pushSubscription.subscribe() : pushSubscription.unsubscribe())
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {pushSubscription.permission === "denied"
                  ? "Notifications are blocked for this site in your browser settings."
                  : "Get notified about streak milestones, unlocked rewards, and new followers even when GymStreak isn't open."}
              </p>
              {pushSubscription.error ? (
                <p className="text-xs text-destructive">{pushSubscription.error}</p>
              ) : null}
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Link
            href={`/u/${me.username}`}
            className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Flame className="size-3.5" />
            Preview your public profile
          </Link>
        </div>
      </main>
    </div>
  );
}
