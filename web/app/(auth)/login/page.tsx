"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
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
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { setTokens } from "@/lib/auth/session";
import { useCurrentUser } from "@/lib/auth/use-current-user";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const destination = isSafeNextPath(next) ? next : "/dashboard";
  const registerHref = isSafeNextPath(next) ? `/register?next=${encodeURIComponent(next)}` : "/register";

  const { user, loading } = useCurrentUser();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!loading && user) router.replace(destination);
  }, [loading, user, router, destination]);

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      const tokens = await login(values);
      setTokens(tokens.access, tokens.refresh);
      router.push(destination);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
    }
  };

  // Already signed in -- avoid flashing the login form before the redirect lands.
  if (loading || user) {
    return <LoadingCard />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Log in to keep your streak going.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-5 my-4">
          {formError ? (
            <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
              <AlertDescription className="text-current">{formError}</AlertDescription>
            </Alert>
          ) : null}

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
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
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
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4">
          <Button type="submit" variant="gradient" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Log in
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            New to GymStreak?{" "}
            <Link
              href={registerHref}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Create an account
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <LoginForm />
    </Suspense>
  );
}
