"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { listAdminGyms, listAdminUsers } from "@/lib/api/admin";

export default function AdminOverviewPage() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    listAdminGyms("pending")
      .then((rows) => setPendingCount(rows.length))
      .catch(() => setPendingCount(0));
    listAdminUsers({})
      .then((res) => setMemberCount(res.count))
      .catch(() => setMemberCount(0));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <p className="mt-1 text-muted-foreground">
          Review gyms waiting for approval and browse every member on the platform.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Link href="/admin/gyms?status=pending">
          <Card className="transition-colors hover:border-primary/30">
            <CardContent className="flex items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Building2 className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold leading-none">
                  {pendingCount === null ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : (
                    pendingCount
                  )}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">Gyms pending review</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/members">
          <Card className="transition-colors hover:border-primary/30">
            <CardContent className="flex items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold leading-none">
                  {memberCount === null ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  ) : (
                    memberCount
                  )}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">Total members</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
