"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2, Lock, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listGymRewards,
  proposeGymReward,
  updateGymReward,
  verifyPerkRedemption,
} from "@/lib/api/gym-manage";
import { listProducts } from "@/lib/api/rewards";
import { ApiError } from "@/lib/api/client";
import { GYM_STATUS_LABEL, GYM_STATUS_TONE } from "@/lib/gym-status";
import { cn } from "@/lib/utils";
import { useGymManageContext } from "../gym-manage-context";
import type { GymReward, Product, RewardType } from "@/types/api";

const REWARD_TYPE_LABEL: Record<RewardType, string> = {
  perk: "Perk",
  merchandise: "Merchandise",
};

const rewardSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    reward_type: z.enum(["perk", "merchandise"]),
    required_streak: z
      .string()
      .refine((v) => /^\d+$/.test(v) && Number(v) > 0, "Must be at least 1 day"),
    product: z.string().optional(),
    terms: z.string().optional(),
  })
  .refine((data) => data.reward_type !== "merchandise" || !!data.product, {
    message: "Select a product for a merchandise reward",
    path: ["product"],
  });

type RewardFormValues = z.infer<typeof rewardSchema>;

function RewardForm({
  products,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  products: Product[];
  defaultValues?: Partial<RewardFormValues>;
  submitLabel: string;
  onSubmit: (values: RewardFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RewardFormValues>({
    resolver: zodResolver(rewardSchema),
    defaultValues: { reward_type: "perk", required_streak: "7", ...defaultValues },
  });
  const rewardType = watch("reward_type");

  const submit = async (values: RewardFormValues) => {
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save this reward.");
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reward-name">Name</Label>
          <Input
            id="reward-name"
            placeholder="Free protein shake"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="required-streak">Required streak (days)</Label>
          <Input
            id="required-streak"
            type="number"
            min={1}
            aria-invalid={!!errors.required_streak}
            {...register("required_streak")}
          />
          {errors.required_streak ? (
            <p className="text-xs text-destructive">{errors.required_streak.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reward-description">Description</Label>
        <Textarea
          id="reward-description"
          placeholder="What does a member get?"
          {...register("description")}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Type</Label>
        <Controller
          control={control}
          name="reward_type"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              items={Object.fromEntries(
                Object.entries(REWARD_TYPE_LABEL) as [RewardType, string][]
              )}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="perk">Perk — handed over in person</SelectItem>
                <SelectItem value="merchandise">Merchandise — shipped item</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {rewardType === "merchandise" ? (
        <div className="space-y-1.5">
          <Label>Product</Label>
          <Controller
            control={control}
            name="product"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                items={Object.fromEntries(products.map((p) => [p.id, `${p.name} (${p.sku})`]))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.product ? (
            <p className="text-xs text-destructive">{errors.product.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="reward-terms">Terms (optional)</Label>
        <Textarea id="reward-terms" placeholder="Any conditions or limits" {...register("terms")} />
      </div>

      {error ? (
        <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
          <AlertDescription className="text-current">{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" variant="gradient" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function RewardRow({
  reward,
  canEdit,
  products,
  onChanged,
}: {
  reward: GymReward;
  canEdit: boolean;
  products: Product[];
  onChanged: () => void;
}) {
  const { gymId } = useGymManageContext();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-lg border border-border p-4">
        <RewardForm
          products={products}
          defaultValues={{
            name: reward.name,
            description: reward.description,
            reward_type: reward.reward_type,
            required_streak: String(reward.required_streak),
            product: reward.product ?? undefined,
            terms: reward.terms,
          }}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await updateGymReward(gymId, reward.id, {
              ...values,
              required_streak: Number(values.required_streak),
            });
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{reward.name}</p>
          <p className="text-sm text-muted-foreground">
            {REWARD_TYPE_LABEL[reward.reward_type]} — {reward.required_streak}-day streak
          </p>
          {reward.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{reward.description}</p>
          ) : null}
        </div>
        <Badge variant="outline" className={cn("shrink-0 border", GYM_STATUS_TONE[reward.status])}>
          {GYM_STATUS_LABEL[reward.status]}
        </Badge>
      </div>

      {reward.status === "pending" && canEdit ? (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          Edit
        </Button>
      ) : canEdit ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Only platform staff can edit this now.
        </p>
      ) : null}
    </li>
  );
}

function VerifyRedemptionCard() {
  const { gymId } = useGymManageContext();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const redemption = await verifyPerkRedemption(gymId, code.trim());
      setResult(`Verified: ${redemption.user_email} — ${redemption.reward_name}`);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify this code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">Verify a redemption code</p>
        <p className="text-sm text-muted-foreground">
          A member shows this code on their phone when picking up a perk in person.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Paste the redemption code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="sm:flex-1"
          />
          <Button onClick={handleVerify} disabled={busy || !code.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Verify
          </Button>
        </div>
        {result ? <p className="text-sm text-success">{result}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function GymRewardsPage() {
  const { gymId, role } = useGymManageContext();
  const [rewards, setRewards] = useState<GymReward[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showProposeForm, setShowProposeForm] = useState(false);

  const isOwner = role === "owner";

  const load = () => {
    listGymRewards(gymId)
      .then(setRewards)
      .catch(() => {
        setRewards([]);
        setListError("Couldn't load rewards. Refresh to try again.");
      });
  };

  useEffect(() => {
    load();
    listProducts()
      .then((res) => setProducts(res.results))
      .catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
          <p className="mt-1 text-muted-foreground">
            Propose reward tiers for your members — platform staff review each one before it goes
            live.
          </p>
        </div>
        {isOwner && !showProposeForm ? (
          <Button variant="gradient" onClick={() => setShowProposeForm(true)}>
            <Plus />
            Propose a reward
          </Button>
        ) : null}
      </div>

      {showProposeForm ? (
        <Card>
          <CardContent>
            <RewardForm
              products={products ?? []}
              submitLabel="Submit for review"
              onCancel={() => setShowProposeForm(false)}
              onSubmit={async (values) => {
                await proposeGymReward(gymId, {
                  ...values,
                  required_streak: Number(values.required_streak),
                });
                setShowProposeForm(false);
                load();
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          {listError ? <p className="mb-3 text-sm text-destructive">{listError}</p> : null}
          {rewards === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : rewards.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No rewards proposed for this gym yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {rewards.map((reward) => (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  canEdit={isOwner}
                  products={products ?? []}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <VerifyRedemptionCard />
    </div>
  );
}
