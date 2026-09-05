"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getMyRewardsOverview, redeemPerk } from "@/lib/api/rewards";
import { ApiError } from "@/lib/api/client";
import type { RewardProgress } from "@/types/api";

const REWARD_STATUS_LABEL: Record<string, string> = {
  earned: "Ready to claim",
  claimed: "Claimed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function RewardRow({ progress, onChanged }: { progress: RewardProgress; onChanged: () => void }) {
  const reward = progress.reward_definition;
  const earned = progress.user_reward;
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRedeem = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await redeemPerk(reward.id);
      if (result.redemption_code) setCode(result.redemption_code);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't redeem this reward.");
    } finally {
      setBusy(false);
    }
  };

  // Derived, not fetched separately: days_remaining = required - current, so
  // current = required - days_remaining. Only meaningful pre-earn -- once
  // earned the reward is done, sticky, and gets a status badge instead.
  const progressFraction =
    !earned && reward.required_streak > 0
      ? Math.min(
          Math.max((reward.required_streak - progress.days_remaining) / reward.required_streak, 0),
          1
        )
      : null;

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{reward.name}</p>
          <p className="text-xs text-muted-foreground">
            {reward.gym_name ?? "Platform-wide"} — {reward.required_streak}-day streak
          </p>
        </div>
        {!earned ? (
          progress.days_remaining > 0 ? (
            <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground">
              🔒 {progress.days_remaining} day{progress.days_remaining === 1 ? "" : "s"} to go
            </Badge>
          ) : (
            // Streak requirement is already met but evaluate_rewards() hasn't
            // run for this user yet -- it only fires on a streak rebuild
            // (i.e. a check-in), not the moment a reward is created/activated.
            // "🔒 0 days to go" would read as a contradiction, so say what's
            // actually true instead.
            <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground">
              Unlocks on your next check-in
            </Badge>
          )
        ) : earned.status === "earned" ? (
          reward.reward_type === "perk" ? (
            <Button size="sm" onClick={handleRedeem} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Redeem
            </Button>
          ) : (
            <Button size="sm" render={<Link href={`/rewards/${reward.id}/claim`} />}>
              Claim
            </Button>
          )
        ) : (
          <Badge variant="outline" className="shrink-0 border-success/20 bg-success/10 text-success">
            {REWARD_STATUS_LABEL[earned.status] ?? earned.status}
          </Badge>
        )}
      </div>
      {progressFraction !== null ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(progressFraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-gradient-brand transition-[width]"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {code ? (
        <Alert className="border-warning/25 bg-warning/5 text-warning">
          <AlertDescription className="text-current">
            Show this code at the gym (shown once): <span className="font-mono">{code}</span>
          </AlertDescription>
        </Alert>
      ) : null}
    </li>
  );
}

export function RewardsCard() {
  const [rewards, setRewards] = useState<RewardProgress[] | null>(null);

  const load = () => {
    getMyRewardsOverview()
      .then(setRewards)
      .catch(() => setRewards([]));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">Rewards</p>
        {rewards === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rewards.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No rewards available yet — check back once your gym sets some up.
          </p>
        ) : (
          <ul className="space-y-2">
            {rewards.map((progress) => (
              <RewardRow key={progress.reward_definition.id} progress={progress} onChanged={load} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
