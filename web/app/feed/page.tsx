"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ActivityFeedList } from "@/components/social/activity-feed-list";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export default function FeedPage() {
  const router = useRouter();
  const { user: me, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent("/feed")}`);
  }, [loading, me, router]);

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
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
        <ActivityFeedList />
      </main>
    </div>
  );
}
