"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Flame, MapPin, Trophy, UserX } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { BadgeMedallion } from "@/components/badges/badge-medallion";
import { FollowButton } from "@/components/social/follow-button";
import { getPublicProfile } from "@/lib/api/users";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { PublicProfile } from "@/types/api";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { user: me, loading: userLoading } = useCurrentUser();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!me) return;
    getPublicProfile(params.username)
      .then(setProfile)
      .catch(() => setNotFound(true));
  }, [me, params.username]);

  useEffect(() => {
    if (!userLoading && !me) {
      router.replace(`/login?next=${encodeURIComponent(`/u/${params.username}`)}`);
    }
  }, [userLoading, me, router, params.username]);

  if (userLoading || !me || (!profile && !notFound)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link
            href="/search"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:px-8">
        {notFound || !profile ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <UserX className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">This profile doesn&apos;t exist.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-2xl font-bold text-primary-foreground">
                      {(profile.first_name || profile.username).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">
                        {[profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
                          profile.username}
                      </p>
                      <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    </div>
                  </div>
                  {me.username !== profile.username ? (
                    <FollowButton
                      username={profile.username}
                      initialFollowing={profile.is_following}
                      onChange={(following) =>
                        setProfile((prev) =>
                          prev
                            ? {
                                ...prev,
                                is_following: following,
                                follower_count: prev.follower_count + (following ? 1 : -1),
                              }
                            : prev
                        )
                      }
                    />
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-4 border-t border-border/70 pt-4 text-sm text-muted-foreground">
                  <Link
                    href={`/u/${profile.username}/followers`}
                    className="flex items-center gap-1.5 hover:text-foreground"
                  >
                    <strong className="text-foreground">{profile.follower_count}</strong>{" "}
                    follower{profile.follower_count === 1 ? "" : "s"}
                  </Link>
                  <Link
                    href={`/u/${profile.username}/following`}
                    className="flex items-center gap-1.5 hover:text-foreground"
                  >
                    <strong className="text-foreground">{profile.following_count}</strong>{" "}
                    following
                  </Link>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {profile.gym_name ?? "No home gym"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Joined{" "}
                    {new Date(profile.joined_at).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Flame className="size-3.5" />
                    {profile.current_streak}-day streak
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Trophy className="size-3.5" />
                    {profile.total_badge_count} badge{profile.total_badge_count === 1 ? "" : "s"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium">Featured badges</p>
                {profile.featured_badges.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No featured badges yet.
                  </p>
                ) : (
                  <div className="flex gap-4">
                    {profile.featured_badges.map((ub) => (
                      <div key={ub.id} className="flex flex-col items-center gap-2 text-center">
                        <BadgeMedallion badge={ub.badge} unlocked size="lg" />
                        <p className="max-w-20 text-xs font-medium">{ub.badge.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
