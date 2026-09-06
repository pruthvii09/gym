"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { approveGym, listAdminGyms, rejectGym } from "@/lib/api/admin";
import { GYM_STATUS_LABEL, GYM_STATUS_TONE } from "@/lib/gym-status";
import { cn } from "@/lib/utils";
import type { AdminGym, GymStatus } from "@/types/api";

const TABS: { label: string; value: GymStatus | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Rejected", value: "rejected" },
  { label: "Inactive", value: "inactive" },
  { label: "All", value: "all" },
];

function isGymStatus(value: string | null): value is GymStatus {
  return value === "pending" || value === "active" || value === "rejected" || value === "inactive";
}

function isTabValue(value: string | null): value is GymStatus | "all" {
  return value === "all" || isGymStatus(value);
}

function GymRow({ gym, onChanged }: { gym: AdminGym; onChanged: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await approveGym(gym.id);
      onChanged();
    } catch {
      setError("Couldn't approve this gym. Try again.");
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await rejectGym(gym.id, reason);
      onChanged();
    } catch {
      setError("Couldn't reject this gym. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{gym.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {gym.address}, {gym.city}
            {gym.state ? `, ${gym.state}` : ""} — {gym.country}
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 border", GYM_STATUS_TONE[gym.status])}>
          {GYM_STATUS_LABEL[gym.status]}
        </Badge>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {gym.status === "pending" ? (
        rejecting ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="sm:flex-1"
            />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleReject} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                Confirm reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejecting(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleApprove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setRejecting(true)}
              disabled={busy}
            >
              <X />
              Reject
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
}

function AdminGymsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("status");
  const activeTab: GymStatus | "all" = isTabValue(tabParam) ? tabParam : "pending";

  const [gyms, setGyms] = useState<AdminGym[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listAdminGyms(activeTab === "all" ? undefined : activeTab)
      .then(setGyms)
      .catch(() => {
        setGyms([]);
        setError("Couldn't load gyms. Refresh to try again.");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gyms</h1>
        <p className="mt-1 text-muted-foreground">
          Review self-service gym submissions and manage the directory.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => router.push(`/admin/gyms?status=${tab.value}`)}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {gyms === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : gyms.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No gyms in this list.
            </p>
          ) : (
            <ul className="space-y-3">
              {gyms.map((gym) => (
                <GymRow key={gym.id} gym={gym} onChanged={load} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminGymsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AdminGymsContent />
    </Suspense>
  );
}
