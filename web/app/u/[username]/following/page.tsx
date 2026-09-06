"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { UserRow } from "@/components/social/user-row";
import { getFollowing } from "@/lib/api/social";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { UserSearchResult } from "@/types/api";

export default function FollowingPage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { user: me, loading } = useCurrentUser();
  const [users, setUsers] = useState<UserSearchResult[] | null>(null);

  useEffect(() => {
    if (!me) return;
    getFollowing(params.username)
      .then((res) => setUsers(res.results))
      .catch(() => setUsers([]));
  }, [me, params.username]);

  useEffect(() => {
    if (!loading && !me) {
      router.replace(`/login?next=${encodeURIComponent(`/u/${params.username}/following`)}`);
    }
  }, [loading, me, router, params.username]);

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
            href={`/u/${params.username}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">@{params.username} is following</h1>
        {users === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Not following anyone yet.</p>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <UserRow key={user.username} user={user} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
