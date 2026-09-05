"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/lib/auth/use-current-user";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#rewards", label: "Rewards" },
];

export function SiteNavbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 sm:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-1.5 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
            <Flame className="size-3.5" />
          </span>
          GymStreak
        </a>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : user ? (
            <>
              <span className="text-sm text-muted-foreground">
                Hi, {user.first_name || user.email}
              </span>
              {user.is_staff ? (
                <Button variant="ghost" render={<Link href="/admin" />}>
                  Admin
                </Button>
              ) : null}
              <Button variant="gradient" render={<Link href="/dashboard" />}>
                Dashboard
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" render={<Link href="/login" />}>
                Log in
              </Button>
              <Button variant="gradient" render={<Link href="/register" />}>
                Sign up
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground sm:hidden"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border/70 px-6 py-4 sm:hidden">
          <nav className="flex flex-col gap-4 text-sm text-muted-foreground">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2">
            {loading ? (
              <Skeleton className="h-9 w-full" />
            ) : user ? (
              <>
                {user.is_staff ? (
                  <Button
                    variant="ghost"
                    className="w-full justify-center"
                    render={<Link href="/admin" />}
                    onClick={() => setOpen(false)}
                  >
                    Admin
                  </Button>
                ) : null}
                <Button
                  variant="gradient"
                  className="w-full justify-center"
                  render={<Link href="/dashboard" />}
                  onClick={() => setOpen(false)}
                >
                  Dashboard
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="w-full justify-center"
                  render={<Link href="/login" />}
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Button>
                <Button
                  variant="gradient"
                  className="w-full justify-center"
                  render={<Link href="/register" />}
                  onClick={() => setOpen(false)}
                >
                  Sign up
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
