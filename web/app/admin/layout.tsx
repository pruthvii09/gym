"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Flame, ShieldCheck } from "lucide-react";

import { useCurrentUser } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/gyms", label: "Gyms" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/fraud", label: "Fraud" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (!user.is_staff) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || !user || !user.is_staff) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 font-semibold">
              <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
                <Flame className="size-3.5" />
              </span>
              GymStreak
            </Link>
            <span className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <ShieldCheck className="size-3" />
              Admin
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Exit to app
          </Link>
        </div>
      </header>

      <div className="border-b border-border/70 px-6 sm:px-8">
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto py-2">
          {ADMIN_NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-10 sm:px-8">{children}</main>
    </div>
  );
}
