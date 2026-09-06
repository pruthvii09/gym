"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, UserRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { searchUsers } from "@/lib/api/users";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { UserSearchResult } from "@/types/api";

export default function SearchPage() {
  const router = useRouter();
  const { user: me, loading: userLoading } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[] | null>(null);

  useEffect(() => {
    if (!userLoading && !me) router.replace(`/login?next=${encodeURIComponent("/search")}`);
  }, [userLoading, me, router]);

  useEffect(() => {
    if (!me) return;
    const trimmed = query.trim();
    if (!trimmed) {
      const timeout = setTimeout(() => setResults(null), 0);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => {
      searchUsers(trimmed)
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [me, query]);

  if (userLoading || !me) {
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
            href="/profile"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Find people</h1>
          <p className="mt-1 text-muted-foreground">Search by username or name.</p>
        </div>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GymStreak members…"
            className="pl-9"
          />
        </div>

        {results !== null ? (
          results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matches found.</p>
          ) : (
            <div className="space-y-2">
              {results.map((row) => (
                <Link key={row.username} href={`/u/${row.username}`}>
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center gap-3 py-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {[row.first_name, row.last_name].filter(Boolean).join(" ") || row.username}
                        </p>
                        <p className="text-xs text-muted-foreground">@{row.username}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )
        ) : null}
      </main>
    </div>
  );
}
