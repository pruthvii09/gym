"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAdminRewardDefinition, updateAdminRewardDefinition } from "@/lib/api/admin";
import { listProducts } from "@/lib/api/rewards";
import { ApiError } from "@/lib/api/client";
import { GYM_STATUS_LABEL, GYM_STATUS_TONE } from "@/lib/gym-status";
import { cn } from "@/lib/utils";
import type {
  AdminRewardDefinition,
  Product,
  RewardDefinitionStatus,
  RewardType,
  UpdateAdminRewardDefinitionRequest,
} from "@/types/api";

const REWARD_TYPES: { value: RewardType; label: string }[] = [
  { value: "merchandise", label: "Merchandise" },
  { value: "perk", label: "Perk" },
];

const STATUSES: { value: RewardDefinitionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "inactive", label: "Inactive" },
];

export default function AdminRewardEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reward, setReward] = useState<AdminRewardDefinition | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [form, setForm] = useState<UpdateAdminRewardDefinitionRequest>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAdminRewardDefinition(params.id)
      .then((data) => {
        setReward(data);
        setForm(data);
      })
      .catch(() => setError("Couldn't load this reward."));
    listProducts()
      .then((res) => setProducts(res.results))
      .catch(() => setProducts([]));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateAdminRewardDefinition(params.id, form);
      setReward(updated);
      setForm(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (error && !reward) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!reward) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/rewards"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{reward.name}</h1>
        <Badge variant="outline" className={cn("border", GYM_STATUS_TONE[reward.status])}>
          {GYM_STATUS_LABEL[reward.status]}
        </Badge>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {reward.gym_name ?? "Platform-wide"}
      </p>

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Reward type</Label>
              <Select
                value={form.reward_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, reward_type: (v as RewardType) ?? f.reward_type }))
                }
                items={Object.fromEntries(REWARD_TYPES.map((t) => [t.value, t.label]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REWARD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="required_streak">Required streak (days)</Label>
              <Input
                id="required_streak"
                type="number"
                min={1}
                value={form.required_streak ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, required_streak: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          {form.reward_type === "merchandise" ? (
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select
                value={form.product ?? undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, product: v ?? undefined }))}
                items={Object.fromEntries((products ?? []).map((p) => [p.id, `${p.name} (${p.sku})`]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, status: (v as RewardDefinitionStatus) ?? f.status }))
              }
              items={Object.fromEntries(STATUSES.map((s) => [s.value, s.label]))}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="terms">Terms</Label>
            <Textarea
              id="terms"
              value={form.terms ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Eligibility gates</p>
          <p className="text-sm text-muted-foreground">
            Platform-wide fraud protection knobs — off by default, not exposed to gym owners.
          </p>
          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={form.require_email_verified ?? false}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, require_email_verified: v === true }))
                }
              />
              Require verified email
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={form.require_phone_verified ?? false}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, require_phone_verified: v === true }))
                }
              />
              Require verified phone
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={form.block_if_high_risk_review ?? false}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, block_if_high_risk_review: v === true }))
                }
              />
              Block if an open high-risk fraud review exists
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="min_age">Minimum account age (days)</Label>
              <Input
                id="min_age"
                type="number"
                min={0}
                value={form.minimum_account_age_days ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimum_account_age_days: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min_checkins">Minimum verified check-ins</Label>
              <Input
                id="min_checkins"
                type="number"
                min={0}
                value={form.minimum_verified_checkins ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimum_verified_checkins: Number(e.target.value) }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-success">Saved.</p> : null}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save changes
        </Button>
        <Button variant="ghost" onClick={() => router.push("/admin/rewards")}>
          Done
        </Button>
      </div>
    </div>
  );
}
