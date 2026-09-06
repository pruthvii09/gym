"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Flame,
  LogOut,
  MoreHorizontal,
  QrCode,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

import { useCurrentUser } from "@/lib/auth/use-current-user";
import { logout as logoutRequest } from "@/lib/api/auth";
import { listMyGymMemberships } from "@/lib/api/gyms";
import { clearTokens, getRefreshToken } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { GYM_STATUS_LABEL, GYM_STATUS_TONE } from "@/lib/gym-status";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GymSwitcher } from "@/components/gym-switcher";
import { GymManageContext, type GymManageContextValue } from "./gym-manage-context";
import type { GymMembershipRole } from "@/types/api";

const STAFF_ROLES: GymMembershipRole[] = ["staff", "manager", "owner"];

function buildTabs(gymId: string, role: GymMembershipRole) {
  return [
    { href: `/gyms/${gymId}/manage/analytics`, label: "Analytics", icon: BarChart3 },
    ...(role === "owner"
      ? [{ href: `/gyms/${gymId}/manage`, label: "Profile", icon: Settings2 }]
      : []),
    { href: `/gyms/${gymId}/manage/members`, label: "Members", icon: Users },
    { href: `/gyms/${gymId}/manage/staff`, label: "Staff", icon: ShieldCheck },
    { href: `/gyms/${gymId}/manage/devices`, label: "Devices", icon: QrCode },
    { href: `/gyms/${gymId}/manage/rewards`, label: "Rewards", icon: Trophy },
  ];
}

export default function GymManageLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const gymId = params.id;
  const { user, loading: userLoading } = useCurrentUser();

  // undefined = still resolving, null = not staff here (redirect away)
  const [context, setContext] = useState<GymManageContextValue | null | undefined>(undefined);

  // `refresh` (handed out via context) needs to call the latest `load`, but
  // `load` also needs to embed `refresh` in the object it builds -- a ref
  // breaks that circular definition without an unsafe forward reference.
  const loadRef = useRef<() => void>(() => {});

  const refresh = useCallback(() => {
    loadRef.current();
  }, []);

  const load = useCallback(() => {
    listMyGymMemberships()
      .then((res) => {
        const membership = res.results.find((m) => m.gym.id === gymId);
        if (membership && STAFF_ROLES.includes(membership.role)) {
          const staffMemberships = res.results.filter((m) => STAFF_ROLES.includes(m.role));
          setContext({
            gymId,
            role: membership.role,
            gym: membership.gym,
            staffMemberships,
            refresh,
          });
        } else {
          setContext(null);
        }
      })
      .catch(() => setContext(null));
  }, [gymId, refresh]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/gyms/${gymId}/manage`)}`);
      return;
    }
    load();
  }, [userLoading, user, gymId, router, load]);

  useEffect(() => {
    if (context === null) router.replace("/dashboard");
  }, [context, router]);

  const handleLogout = async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await logoutRequest(refreshToken);
      } catch {
        // token may already be expired/blacklisted -- clear local state regardless
      }
    }
    clearTokens();
    router.push("/login");
  };

  if (userLoading || !context) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const tabs = buildTabs(gymId, context.role);

  return (
    <GymManageContext.Provider value={context}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 md:flex">
          <Link href="/" className="flex items-center gap-1.5 px-4 py-4 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
              <Flame className="size-4" />
            </span>
            GymStreak
          </Link>

          <div className="space-y-2 px-3">
            <GymSwitcher memberships={context.staffMemberships} currentGymId={gymId} />
            <Badge
              variant="outline"
              className={cn("w-full justify-center border", GYM_STATUS_TONE[context.gym.status])}
            >
              {GYM_STATUS_LABEL[context.gym.status]}
            </Badge>
          </div>

          <nav className="mt-4 flex-1 space-y-0.5 px-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-0.5 border-t border-border/70 p-3">
            {user?.is_staff ? (
              <Link
                href="/admin"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ShieldCheck className="size-4" />
                Admin panel
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
              Log out
            </button>
            <p className="truncate px-2.5 pt-1 text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </aside>

        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3 md:hidden">
          <Link href="/" className="flex shrink-0 items-center gap-1.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
              <Flame className="size-3.5" />
            </span>
          </Link>
          <GymSwitcher
            memberships={context.staffMemberships}
            currentGymId={gymId}
            className="w-auto flex-1"
          />
          <Badge
            variant="outline"
            className={cn("shrink-0 border", GYM_STATUS_TONE[context.gym.status])}
          >
            {GYM_STATUS_LABEL[context.gym.status]}
          </Badge>
        </div>

        <main className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-6 py-10 sm:px-8">{children}</div>
        </main>

        {/* Bottom tab bar on mobile -- thumb-reachable, doesn't compete with the
            top bar for space as tabs grow, unlike the old horizontal-scroll pill row. */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/70 bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Gym management"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                {tab.label}
              </Link>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
                />
              }
            >
              <MoreHorizontal className="size-5" />
              More
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="mb-2 w-48">
              <p className="truncate px-1.5 py-1 text-xs text-muted-foreground">{user?.email}</p>
              <DropdownMenuSeparator />
              {user?.is_staff ? (
                <DropdownMenuItem render={<Link href="/admin" />}>
                  <ShieldCheck />
                  Admin panel
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </GymManageContext.Provider>
  );
}
