"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Pencil, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  approveRewardDefinition,
  listAdminRewardDefinitions,
  rejectRewardDefinition,
} from "@/lib/api/admin";
import { GYM_STATUS_LABEL, GYM_STATUS_TONE } from "@/lib/gym-status";
import { cn } from "@/lib/utils";
import type { AdminRewardDefinition, RewardDefinitionStatus } from "@/types/api";

const TABS: { label: string; value: RewardDefinitionStatus | "all" }[] = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Rejected", value: "rejected" },
  { label: "Inactive", value: "inactive" },
  { label: "All", value: "all" },
];

function isRewardStatus(value: string | null): value is RewardDefinitionStatus {
  return value === "pending" || value === "active" || value === "rejected" || value === "inactive";
}

function isTabValue(value: string | null): value is RewardDefinitionStatus | "all" {
  return value === "all" || isRewardStatus(value);
}

const REWARD_TYPE_LABEL: Record<AdminRewardDefinition["reward_type"], string> = {
  merchandise: "Merchandise",
  perk: "Perk",
};

function RewardRow({
  reward,
  onChanged,
}: {
  reward: AdminRewardDefinition;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await approveRewardDefinition(reward.id);
      onChanged();
    } catch {
      setError("Couldn't approve this reward. Try again.");
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await rejectRewardDefinition(reward.id, reason);
      onChanged();
    } catch {
      setError("Couldn't reject this reward. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{reward.name}</p>
          <p className="text-sm text-muted-foreground">
            {reward.gym_name ?? "Platform-wide"} — {REWARD_TYPE_LABEL[reward.reward_type]} —{" "}
            {reward.required_streak}-day streak
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn("border", GYM_STATUS_TONE[reward.status])}>
            {GYM_STATUS_LABEL[reward.status]}
          </Badge>
          <Button variant="ghost" size="icon-sm" render={<Link href={`/admin/rewards/${reward.id}`} />}>
            <Pencil />
          </Button>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {reward.status === "pending" ? (
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
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy}>
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

function AdminRewardsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("status");
  const activeTab: RewardDefinitionStatus | "all" = isTabValue(tabParam) ? tabParam : "pending";

  const [rewards, setRewards] = useState<AdminRewardDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listAdminRewardDefinitions(activeTab === "all" ? undefined : activeTab)
      .then(setRewards)
      .catch(() => {
        setRewards([]);
        setError("Couldn't load rewards. Refresh to try again.");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="mt-1 text-muted-foreground">
          Review gym-proposed reward tiers, or edit any reward at any time.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => router.push(`/admin/rewards?status=${tab.value}`)}
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
          {rewards === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : rewards.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No rewards in this list.
            </p>
          ) : (
            <ul className="space-y-3">
              {rewards.map((reward) => (
                <RewardRow key={reward.id} reward={reward} onChanged={load} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminRewardsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AdminRewardsContent />
    </Suspense>
  );
}
