"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Flame, Loader2, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createGym } from "@/lib/api/gyms";
import { ApiError } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";

const LAT_RANGE = { min: -90, max: 90 };
const LNG_RANGE = { min: -180, max: 180 };

function decimalInRange(value: string, range: { min: number; max: number }) {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  return n >= range.min && n <= range.max;
}

const createGymSchema = z.object({
  name: z.string().min(1, "Gym name is required"),
  description: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  country: z.string().min(1, "Country is required"),
  postal_code: z.string().optional(),
  latitude: z
    .string()
    .min(1, "Latitude is required")
    .refine((v) => decimalInRange(v, LAT_RANGE), "Enter a valid latitude (-90 to 90)"),
  longitude: z
    .string()
    .min(1, "Longitude is required")
    .refine((v) => decimalInRange(v, LNG_RANGE), "Enter a valid longitude (-180 to 180)"),
  checkin_radius_meters: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) > 0), "Enter a positive number of meters"),
});

type CreateGymFormValues = z.infer<typeof createGymSchema>;

export default function NewGymPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const [formError, setFormError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateGymFormValues>({
    resolver: zodResolver(createGymSchema),
    defaultValues: {
      name: "",
      description: "",
      address: "",
      city: "",
      state: "",
      country: "",
      postal_code: "",
      latitude: "",
      longitude: "",
      checkin_radius_meters: "100",
    },
  });

  useEffect(() => {
    if (!userLoading && !user) router.replace("/login?next=/gyms/new");
  }, [userLoading, user, router]);

  const handleUseLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Geolocation isn't supported in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValue("latitude", position.coords.latitude.toFixed(6), { shouldValidate: true });
        setValue("longitude", position.coords.longitude.toFixed(6), { shouldValidate: true });
        setLocating(false);
      },
      () => {
        setLocationError("Couldn't get your location — enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onSubmit = async (values: CreateGymFormValues) => {
    setFormError(null);
    try {
      await createGym({
        name: values.name,
        description: values.description || undefined,
        address: values.address,
        city: values.city,
        state: values.state || undefined,
        country: values.country,
        postal_code: values.postal_code || undefined,
        latitude: values.latitude,
        longitude: values.longitude,
        checkin_radius_meters: values.checkin_radius_meters
          ? Number(values.checkin_radius_meters)
          : undefined,
      });
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        const fields: (keyof CreateGymFormValues)[] = [
          "name",
          "address",
          "city",
          "state",
          "country",
          "postal_code",
          "latitude",
          "longitude",
          "checkin_radius_meters",
        ];
        let mapped = false;
        for (const f of fields) {
          const message = err.fieldError(f);
          if (message) {
            setError(f, { message });
            mapped = true;
          }
        }
        if (!mapped) setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  if (userLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
              <Flame className="size-3.5" />
            </span>
            GymStreak
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 sm:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create your gym</CardTitle>
            <CardDescription>
              You&apos;ll become its owner. A GymStreak admin reviews every new gym before
              it&apos;s visible to members — this one will show as pending until then.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-5 my-4">
              {formError ? (
                <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
                  <AlertDescription className="text-current">{formError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="name">Gym name</Label>
                <Input id="name" aria-invalid={!!errors.name} {...field("name")} />
                {errors.name ? (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea id="description" {...field("description")} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" aria-invalid={!!errors.address} {...field("address")} />
                {errors.address ? (
                  <p className="text-xs text-destructive">{errors.address.message}</p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" aria-invalid={!!errors.city} {...field("city")} />
                  {errors.city ? (
                    <p className="text-xs text-destructive">{errors.city.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State (optional)</Label>
                  <Input id="state" {...field("state")} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" aria-invalid={!!errors.country} {...field("country")} />
                  {errors.country ? (
                    <p className="text-xs text-destructive">{errors.country.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postal_code">Postal code (optional)</Label>
                  <Input id="postal_code" {...field("postal_code")} />
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Coordinates</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseLocation}
                    disabled={locating}
                  >
                    {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                    Use my current location
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      placeholder="40.712800"
                      aria-invalid={!!errors.latitude}
                      {...field("latitude")}
                    />
                    {errors.latitude ? (
                      <p className="text-xs text-destructive">{errors.latitude.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      placeholder="-74.006000"
                      aria-invalid={!!errors.longitude}
                      {...field("longitude")}
                    />
                    {errors.longitude ? (
                      <p className="text-xs text-destructive">{errors.longitude.message}</p>
                    ) : null}
                  </div>
                </div>
                {locationError ? (
                  <p className="text-xs text-destructive">{locationError}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="checkin_radius_meters">Check-in radius (meters)</Label>
                <Input
                  id="checkin_radius_meters"
                  inputMode="numeric"
                  aria-invalid={!!errors.checkin_radius_meters}
                  {...field("checkin_radius_meters")}
                />
                <p className="text-xs text-muted-foreground">
                  How close a member&apos;s GPS position must be to verify a check-in. Defaults
                  to 100m.
                </p>
                {errors.checkin_radius_meters ? (
                  <p className="text-xs text-destructive">
                    {errors.checkin_radius_meters.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost" type="button" render={<Link href="/dashboard" />}>
                Cancel
              </Button>
              <Button type="submit" variant="gradient" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Submit for review
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
