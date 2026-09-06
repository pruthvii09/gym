import Link from "next/link";
import { UserRound } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { UserSearchResult } from "@/types/api";

export function UserRow({ user }: { user: UserSearchResult }) {
  return (
    <Link href={`/u/${user.username}`}>
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-3 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}
            </p>
            <p className="text-xs text-muted-foreground">@{user.username}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
