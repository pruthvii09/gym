"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { updateGym } from "@/lib/api/gym-manage";
import { ApiError } from "@/lib/api/client";
import { useGymManageContext } from "./gym-manage-context";

const LAT_RANGE = { min: -90, max: 90 };
const LNG_RANGE = { min: -180, max: 180 };

function decimalInRange(value: string, range: { min: number; max: number }) {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  return n >= range.min && n <= range.max;
}

const profileSchema = z.object({
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

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function GymProfilePage() {
  const router = useRouter();
  const { gymId, role, gym, refresh } = useGymManageContext();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (role !== "owner") router.replace(`/gyms/${gymId}/manage/members`);
  }, [role, gymId, router]);

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: gym.name,
      description: gym.description,
      address: gym.address,
      city: gym.city,
      state: gym.state,
      country: gym.country,
      postal_code: gym.postal_code,
      latitude: gym.latitude,
      longitude: gym.longitude,
      checkin_radius_meters: String(gym.checkin_radius_meters),
    },
  });

  if (role !== "owner") return null;

  const onSubmit = async (values: ProfileFormValues) => {
    setFormError(null);
    setSaved(false);
    try {
      await updateGym(gymId, {
        ...values,
        checkin_radius_meters: values.checkin_radius_meters
          ? Number(values.checkin_radius_meters)
          : undefined,
      });
      refresh();
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields: (keyof ProfileFormValues)[] = [
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gym profile</h1>
        <p className="mt-1 text-muted-foreground">
          Visible to members once your gym is approved.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-5 my-4">
            {formError ? (
              <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
                <AlertDescription className="text-current">{formError}</AlertDescription>
              </Alert>
            ) : null}
            {saved ? (
              <Alert className="border-success/25 bg-success/5 text-success">
                <AlertDescription className="text-current">Saved.</AlertDescription>
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
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...field("description")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" aria-invalid={!!errors.address} {...field("address")} />
              {errors.address ? (
                <p className="text-xs text-destructive">{errors.address.message}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" aria-invalid={!!errors.city} {...field("city")} />
                {errors.city ? (
                  <p className="text-xs text-destructive">{errors.city.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" {...field("state")} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="country">Country</Label>
                <Input id="country" aria-invalid={!!errors.country} {...field("country")} />
                {errors.country ? (
                  <p className="text-xs text-destructive">{errors.country.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postal_code">Postal code</Label>
                <Input id="postal_code" {...field("postal_code")} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" aria-invalid={!!errors.latitude} {...field("latitude")} />
                {errors.latitude ? (
                  <p className="text-xs text-destructive">{errors.latitude.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" aria-invalid={!!errors.longitude} {...field("longitude")} />
                {errors.longitude ? (
                  <p className="text-xs text-destructive">{errors.longitude.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="checkin_radius_meters">Check-in radius (meters)</Label>
              <Input
                id="checkin_radius_meters"
                inputMode="numeric"
                aria-invalid={!!errors.checkin_radius_meters}
                {...field("checkin_radius_meters")}
              />
              {errors.checkin_radius_meters ? (
                <p className="text-xs text-destructive">
                  {errors.checkin_radius_meters.message}
                </p>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" variant="gradient" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save changes
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
