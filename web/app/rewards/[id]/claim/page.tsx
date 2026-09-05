"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { claimReward, getReward } from "@/lib/api/rewards";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { RewardDefinition } from "@/types/api";

const claimSchema = z.object({
  variant_id: z.string().min(1, "Select a size"),
  name: z.string().min(1, "Name is required"),
  line1: z.string().min(1, "Address is required"),
  line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  postal_code: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
  phone: z.string().optional(),
});

type ClaimFormValues = z.infer<typeof claimSchema>;

export default function RewardClaimPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const [reward, setReward] = useState<RewardDefinition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClaimFormValues>({ resolver: zodResolver(claimSchema) });

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/rewards/${params.id}/claim`)}`);
      return;
    }
    getReward(params.id)
      .then(setReward)
      .catch(() => setLoadError("Couldn't load this reward."));
  }, [userLoading, user, params.id, router]);

  const onSubmit = async (values: ClaimFormValues) => {
    setSubmitError(null);
    try {
      await claimReward(params.id, {
        variant_id: values.variant_id,
        address: {
          name: values.name,
          line1: values.line1,
          line2: values.line2,
          city: values.city,
          state: values.state,
          postal_code: values.postal_code,
          country: values.country,
          phone: values.phone,
        },
      });
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't claim this reward.");
    }
  };

  if (userLoading || (!reward && !loadError)) {
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
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : success ? (
          <Card className="border-success/25 bg-success/5">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="size-10 text-success" />
              <p className="font-medium text-success">Claimed! We&apos;ll ship it your way.</p>
              <Button variant="outline" size="sm" render={<Link href="/dashboard" />}>
                Back to dashboard
              </Button>
            </CardContent>
          </Card>
        ) : reward ? (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{reward.name}</h1>
              <p className="mt-1 text-muted-foreground">{reward.description}</p>
            </div>

            <Card>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Size</Label>
                    <Controller
                      control={control}
                      name="variant_id"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          items={Object.fromEntries(
                            reward.variants.map((v) => [
                              v.id,
                              v.in_stock ? v.size : `${v.size} (out of stock)`,
                            ])
                          )}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a size" />
                          </SelectTrigger>
                          <SelectContent>
                            {reward.variants.map((v) => (
                              <SelectItem key={v.id} value={v.id} disabled={!v.in_stock}>
                                {v.size} {v.in_stock ? "" : "(out of stock)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.variant_id ? (
                      <p className="text-xs text-destructive">{errors.variant_id.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
                    {errors.name ? (
                      <p className="text-xs text-destructive">{errors.name.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="line1">Address</Label>
                    <Input id="line1" aria-invalid={!!errors.line1} {...register("line1")} />
                    {errors.line1 ? (
                      <p className="text-xs text-destructive">{errors.line1.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="line2">Address line 2 (optional)</Label>
                    <Input id="line2" {...register("line2")} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" aria-invalid={!!errors.city} {...register("city")} />
                      {errors.city ? (
                        <p className="text-xs text-destructive">{errors.city.message}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="state">State (optional)</Label>
                      <Input id="state" {...register("state")} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="postal_code">Postal code</Label>
                      <Input
                        id="postal_code"
                        aria-invalid={!!errors.postal_code}
                        {...register("postal_code")}
                      />
                      {errors.postal_code ? (
                        <p className="text-xs text-destructive">{errors.postal_code.message}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        aria-invalid={!!errors.country}
                        {...register("country")}
                      />
                      {errors.country ? (
                        <p className="text-xs text-destructive">{errors.country.message}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input id="phone" {...register("phone")} />
                  </div>

                  {submitError ? (
                    <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
                      <AlertDescription className="text-current">{submitError}</AlertDescription>
                    </Alert>
                  ) : null}

                  <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                    Claim reward
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
