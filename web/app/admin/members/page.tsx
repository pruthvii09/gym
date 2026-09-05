"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listAdminUsers, setUserActive } from "@/lib/api/admin";
import { cn } from "@/lib/utils";
import type { AdminUser } from "@/types/api";

type StatusFilter = "all" | "active" | "suspended";

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
];

function MemberRow({ member, onChanged }: { member: AdminUser; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = [member.first_name, member.last_name].filter(Boolean).join(" ") || "—";

  const handleToggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await setUserActive(member.id, !member.is_active);
      onChanged();
    } catch {
      setError("Couldn't update this member. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{displayName}</p>
          <p className="truncate text-sm text-muted-foreground">{member.email}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {member.gym ? member.gym.name : "No home gym"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0",
            member.is_active
              ? "border-success/20 bg-success/10 text-success"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          )}
        >
          {member.is_active ? "Active" : "Suspended"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge
          variant="outline"
          className={
            member.email_verified
              ? "border-success/20 bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          }
        >
          {member.email_verified ? "Email verified" : "Email unverified"}
        </Badge>
        {member.is_staff ? (
          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
            Staff
          </Badge>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button
        variant={member.is_active ? "ghost" : "outline"}
        size="sm"
        className={member.is_active ? "text-destructive hover:text-destructive" : ""}
        onClick={handleToggle}
        disabled={busy}
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        {member.is_active ? "Suspend" : "Restore"}
      </Button>
    </li>
  );
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = () => {
    setMembers(null);
    listAdminUsers({
      search: search || undefined,
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
    })
      .then((res) => setMembers(res.results))
      .catch(() => {
        setMembers([]);
        setError("Couldn't load members. Refresh to try again.");
      });
  };

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-muted-foreground">Every registered account on GymStreak.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                statusFilter === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {members === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No members found.</p>
          ) : (
            <ul className="space-y-3">
              {members.map((member) => (
                <MemberRow key={member.id} member={member} onChanged={load} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
