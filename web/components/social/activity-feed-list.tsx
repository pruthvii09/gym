"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ActivityFeedItem } from "@/components/social/activity-feed-item";
import { getFeed } from "@/lib/api/social";
import type { ActivityItem } from "@/types/api";

export function ActivityFeedList() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getFeed(1)
      .then((res) => {
        setItems(res.results);
        setNextPage(res.next ? 2 : null);
      })
      .catch(() => setItems([]));
  }, []);

  const loadMore = () => {
    if (!nextPage) return;
    setLoadingMore(true);
    getFeed(nextPage)
      .then((res) => {
        setItems((prev) => [...(prev ?? []), ...res.results]);
        setNextPage(res.next ? nextPage + 1 : null);
      })
      .finally(() => setLoadingMore(false));
  };

  if (items === null) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-center">
        <p className="text-sm text-muted-foreground">
          Follow other members to see their activity here.
        </p>
        <Button variant="outline" render={<Link href="/search" />}>
          Find people to follow
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((item) => (
          <ActivityFeedItem key={item.id} item={item} />
        ))}
      </ul>
      {nextPage ? (
        <Button
          variant="outline"
          className="w-full justify-center"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
