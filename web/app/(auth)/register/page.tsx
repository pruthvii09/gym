"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMe, login, register as registerRequest } from "@/lib/api/auth";
import { listGyms } from "@/lib/api/gyms";
import { ApiError } from "@/lib/api/client";
import { setTokens } from "@/lib/auth/session";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import type { GymSummary } from "@/types/api";

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

type Intent = "join" | "create";

// gym_id is only required when joining an existing gym -- someone here to
// create their own gym has nothing to pick yet (they create it right after,
// on /gyms/new) and the backend itself already treats gym_id as optional at
// registration for exactly this kind of case.
function buildRegisterSchema(intent: Intent) {
  return z
    .object({
      email: z
        .string()
        .min(1, "Email is required")
        .regex(EMAIL_REGEX, "Enter a valid email address"),
      username: z
        .string()
        .min(1, "Username is required")
        .regex(
          USERNAME_REGEX,
          "Lowercase letters, numbers, and underscores only (3-30 characters)"
        ),
      password: z.string().min(8, "Password must be at least 8 characters"),
      confirmPassword: z.string().min(1, "Confirm your password"),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      phone: z.string().optional(),
      gym_id:
        intent === "join" ? z.string().min(1, "Select a gym") : z.string().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    })
    .refine((data) => !data.phone || PHONE_REGEX.test(data.phone), {
      message: "Enter a valid phone number (7-15 digits, optional leading +)",
      path: ["phone"],
    });
}

type RegisterFormValues = z.infer<ReturnType<typeof buildRegisterSchema>>;

function isSafeNextPath(next: string | null): next is string {
  // Only ever redirect to a same-app path -- guards against an open
  // redirect via a crafted ?next= pointing at another origin.
  return !!next && next.startsWith("/") && !next.startsWith("//");
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Loading…
      </CardContent>
    </Card>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const loginHref = isSafeNextPath(next) ? `/login?next=${encodeURIComponent(next)}` : "/login";

  // A staff invite assigns a specific gym on acceptance (not at registration
  // time) -- same "no picker needed" shape as creating your own gym, so it
  // reuses the "create" intent's mechanics, just with different copy and no
  // toggle (there's no real join-vs-create choice mid-invite).
  const isInviteFlow = !!next && next.startsWith("/staff-invites/");

  const { user, loading: userLoading } = useCurrentUser();
  const [intent, setIntent] = useState<Intent>(
    next === "/gyms/new" || isInviteFlow ? "create" : "join"
  );
  const [gyms, setGyms] = useState<GymSummary[] | null>(null);
  const [gymsError, setGymsError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Where a successful registration lands: an explicit ?next= always wins;
  // otherwise "create a gym" sends you straight to the create-gym form
  // instead of the generic dashboard, since that's the whole reason to be
  // here in "create" mode.
  const destination = isSafeNextPath(next)
    ? next
    : intent === "create"
      ? "/gyms/new"
      : "/dashboard";

  const schema = useMemo(() => buildRegisterSchema(intent), [intent]);

  const {
    register: field,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      first_name: "",
      last_name: "",
      phone: "",
      gym_id: "",
    },
  });

  useEffect(() => {
    listGyms()
      .then((res) => setGyms(res.results))
      .catch(() => setGymsError("Couldn't load the gym directory. Refresh to try again."));
  }, []);

  useEffect(() => {
    if (!userLoading && user) router.replace(destination);
  }, [userLoading, user, router, destination]);

  const handleIntentChange = (newIntent: Intent) => {
    setIntent(newIntent);
    if (newIntent === "create") setValue("gym_id", "");
  };

  const onSubmit = async (values: RegisterFormValues) => {
    setFormError(null);
    try {
      await registerRequest({
        email: values.email,
        username: values.username.toLowerCase(),
        password: values.password,
        first_name: values.first_name || undefined,
        last_name: values.last_name || undefined,
        phone: values.phone || undefined,
        gym_id: intent === "join" ? values.gym_id : undefined,
      });

      // Registration doesn't auto-login (API_CONTRACTS.md §6.1) -- chain a
      // login call with the same credentials so the user lands signed in.
      const tokens = await login({ email: values.email, password: values.password });
      setTokens(tokens.access, tokens.refresh);
      await getMe();
      router.push(destination);
    } catch (err) {
      if (err instanceof ApiError) {
        const emailError = err.fieldError("email");
        const usernameError = err.fieldError("username");
        const passwordError = err.fieldError("password");
        const phoneError = err.fieldError("phone");
        const gymError = err.fieldError("gym_id");
        if (emailError) setError("email", { message: emailError });
        if (usernameError) setError("username", { message: usernameError });
        if (passwordError) setError("password", { message: passwordError });
        if (phoneError) setError("phone", { message: phoneError });
        if (gymError) setError("gym_id", { message: gymError });
        if (!emailError && !usernameError && !passwordError && !phoneError && !gymError) {
          setFormError(err.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  const noGymsAvailable = gyms !== null && gyms.length === 0;

  // Already signed in -- avoid flashing the register form before the redirect lands.
  if (userLoading || user) {
    return <LoadingCard />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          {isInviteFlow
            ? "You've been invited to join a gym's staff — finish creating your account to accept."
            : intent === "create"
              ? "You'll create your gym right after this — no need to join one first."
              : "Verified check-ins, real streaks, real rewards."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-5 my-4">
          {formError ? (
            <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
              <AlertDescription className="text-current">{formError}</AlertDescription>
            </Alert>
          ) : null}

          {isInviteFlow ? null : (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => handleIntentChange("join")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                intent === "join"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Join a gym
            </button>
            <button
              type="button"
              onClick={() => handleIntentChange("create")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                intent === "create"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Create a gym
            </button>
          </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" autoComplete="given-name" {...field("first_name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" autoComplete="family-name" {...field("last_name")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...field("email")}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                @
              </span>
              <Input
                id="username"
                autoComplete="username"
                placeholder="your_username"
                className="pl-7"
                aria-invalid={!!errors.username}
                {...field("username")}
              />
            </div>
            {errors.username ? (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Shown on your public profile — you can change it later.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+15551234567"
              aria-invalid={!!errors.phone}
              {...field("phone")}
            />
            {errors.phone ? (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            ) : null}
          </div>

          {intent === "join" ? (
            <div className="space-y-1.5">
              <Label htmlFor="gym_id">Home gym</Label>
              <Controller
                control={control}
                name="gym_id"
                render={({ field: gymField }) => (
                  <Select
                    value={gymField.value}
                    onValueChange={gymField.onChange}
                    disabled={gyms === null || noGymsAvailable}
                    items={Object.fromEntries(
                      (gyms ?? []).map((gym) => [gym.id, `${gym.name} — ${gym.city}`])
                    )}
                  >
                    <SelectTrigger id="gym_id" className="w-full" aria-invalid={!!errors.gym_id}>
                      <SelectValue
                        placeholder={gyms === null ? "Loading gyms…" : "Select a gym"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(gyms ?? []).map((gym) => (
                        <SelectItem key={gym.id} value={gym.id}>
                          {gym.name} — {gym.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.gym_id ? (
                <p className="text-xs text-destructive">{errors.gym_id.message}</p>
              ) : null}
              {gymsError ? <p className="text-xs text-destructive">{gymsError}</p> : null}
              {noGymsAvailable ? (
                <p className="text-xs text-muted-foreground">
                  No gyms are available to join yet — check back soon, or{" "}
                  <button
                    type="button"
                    onClick={() => handleIntentChange("create")}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    create your own
                  </button>
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                className="pr-9"
                {...field("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                className="pr-9"
                {...field("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.confirmPassword ? (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4">
          <Button
            type="submit"
            variant="gradient"
            disabled={isSubmitting || (intent === "join" && noGymsAvailable)}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {intent === "create" ? "Create account & continue" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={loginHref} className="font-medium text-foreground underline underline-offset-4">
              Log in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <RegisterForm />
    </Suspense>
  );
}
