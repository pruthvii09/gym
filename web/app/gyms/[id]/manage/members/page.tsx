"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarOff,
  Dumbbell,
  Eye,
  Flame,
  Loader2,
  MoreHorizontal,
  Search,
  Trophy,
  UserX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getGymMemberDetail,
  listGymMembers,
  removeGymMember,
  updateGymMemberRestDay,
} from "@/lib/api/gym-manage";
import { ApiError } from "@/lib/api/client";
import { WEEKDAY_LABELS } from "@/lib/rest-day";
import { formatDuration } from "@/components/workouts/workout-history-card";
import { useGymManageContext } from "../gym-manage-context";
import type { GymMember, GymMemberDetail } from "@/types/api";

const CHECKIN_STATUS_TONE: Record<string, string> = {
  verified: "border-success/20 bg-success/10 text-success",
  review: "border-warning/25 bg-warning/5 text-warning",
  rejected: "border-destructive/20 bg-destructive/5 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

function memberName(member: { user: { first_name: string; last_name: string; email: string } }) {
  return [member.user.first_name, member.user.last_name].filter(Boolean).join(" ") || member.user.email;
}

function MemberActionsMenu({
  member,
  canManageMembers,
  onView,
  onRemove,
}: {
  member: GymMember;
  canManageMembers: boolean;
  onView: (member: GymMember) => void;
  onRemove: (member: GymMember) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onView(member)}>
          <Eye />
          View details
        </DropdownMenuItem>
        {canManageMembers ? (
          <DropdownMenuItem variant="destructive" onClick={() => onRemove(member)}>
            <UserX />
            Remove from gym
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MemberRestDayEditor({
  gymId,
  membershipId,
  restDay,
  onUpdated,
}: {
  gymId: string;
  membershipId: string;
  restDay: GymMemberDetail["rest_day"];
  onUpdated: (restDay: GymMemberDetail["rest_day"]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(
    restDay.day_of_week !== null ? String(restDay.day_of_week) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (selected === "") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateGymMemberRestDay(gymId, membershipId, {
        day_of_week: Number(selected),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update their rest day.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarOff className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            Rest day:{" "}
            <span className="font-medium">
              {restDay.day_of_week !== null ? WEEKDAY_LABELS[restDay.day_of_week] : "Not set"}
            </span>
          </p>
        </div>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(restDay.day_of_week !== null ? String(restDay.day_of_week) : "");
              setEditing(true);
            }}
          >
            {restDay.day_of_week !== null ? "Change" : "Set"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {restDay.self_service_changes_used}/
        {restDay.self_service_changes_used + restDay.self_service_changes_remaining} of their own
        changes used — setting it here resets that to 0.
      </p>
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={selected}
            onValueChange={(v) => setSelected(v ?? "")}
            items={Object.fromEntries(WEEKDAY_LABELS.map((label, i) => [String(i), label]))}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Choose a day" />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_LABELS.map((label, i) => (
                <SelectItem key={label} value={String(i)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={busy || selected === ""}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function MemberDetailSheet({
  gymId,
  member,
  onOpenChange,
}: {
  gymId: string;
  member: GymMember | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<GymMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    getGymMemberDetail(gymId, member.id)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this member's details.");
      });
    return () => {
      cancelled = true;
    };
  }, [gymId, member]);

  return (
    <Sheet open={!!member} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{member ? memberName(member) : "Member"}</SheetTitle>
          <SheetDescription>{member?.user.email}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!detail ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={
                    detail.user.email_verified
                      ? "border-success/20 bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {detail.user.email_verified ? "Email verified" : "Email unverified"}
                </Badge>
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  Joined {formatDate(detail.created_at)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="flex items-center gap-3 py-4">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Flame className="size-4" />
                    </span>
                    <div>
                      <p className="text-xl leading-none font-semibold">
                        {detail.streak.current_streak}
                      </p>
                      <p className="text-xs text-muted-foreground">Current streak</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-3 py-4">
                    <span className="flex size-9 items-center justify-center rounded-md bg-warning/10 text-warning">
                      <Trophy className="size-4" />
                    </span>
                    <div>
                      <p className="text-xl leading-none font-semibold">
                        {detail.streak.longest_streak}
                      </p>
                      <p className="text-xs text-muted-foreground">Longest streak</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <p className="-mt-3 text-xs text-muted-foreground">
                Last activity: {formatDate(detail.streak.last_activity_date)}
              </p>

              <MemberRestDayEditor
                gymId={gymId}
                membershipId={member!.id}
                restDay={detail.rest_day}
                onUpdated={(rest_day) => setDetail((d) => (d ? { ...d, rest_day } : d))}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">Recent check-ins at this gym</p>
                {detail.recent_checkins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No check-ins yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.recent_checkins.map((checkin) => (
                      <li
                        key={checkin.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span>{formatDateTime(checkin.checked_in_at)}</span>
                        <Badge
                          variant="outline"
                          className={CHECKIN_STATUS_TONE[checkin.status] ?? ""}
                        >
                          {checkin.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Recent workouts</p>
                {detail.recent_workouts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No workouts logged yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.recent_workouts.map((session) => (
                      <li
                        key={session.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-1.5">
                          <Dumbbell className="size-3.5 text-muted-foreground" />
                          {formatDateTime(session.started_at)} — {session.exercise_count} exercise
                          {session.exercise_count === 1 ? "" : "s"}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            session.status === "completed"
                              ? "border-success/20 bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {session.status === "completed"
                            ? formatDuration(session.duration_seconds)
                            : session.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function GymMembersPage() {
  const { gymId, role: actorRole } = useGymManageContext();
  const [members, setMembers] = useState<GymMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<GymMember | null>(null);
  const [removing, setRemoving] = useState<GymMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const canManageMembers = actorRole === "owner" || actorRole === "manager";

  const load = () => {
    listGymMembers(gymId)
      .then((res) => setMembers(res.results))
      .catch(() => {
        setMembers([]);
        setError("Couldn't load members. Refresh to try again.");
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  const filtered = useMemo(() => {
    if (!members) return null;
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => memberName(m).toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q)
    );
  }, [members, search]);

  const handleConfirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeGymMember(gymId, removing.id);
      setRemoving(null);
      if (viewing?.id === removing.id) setViewing(null);
      load();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : "Couldn't remove this member.");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-muted-foreground">
            Everyone who registered with this gym as their home gym.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {filtered === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {members && members.length > 0
                ? "No members match your search."
                : "No members have joined this gym yet."}
            </p>
          ) : (
            <>
              {/* Table only from lg -- the persistent 256px sidebar eats enough width
                  that md-width viewports still can't fit 5 columns comfortably, so the
                  stacked card list covers everything below lg, not just phone widths. */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{memberName(member)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              member.user.email_verified
                                ? "border-success/20 bg-success/10 text-success"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {member.user.email_verified ? "Verified" : "Unverified"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(member.created_at)}
                        </TableCell>
                        <TableCell>
                          <MemberActionsMenu
                            member={member}
                            canManageMembers={canManageMembers}
                            onView={setViewing}
                            onRemove={setRemoving}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="space-y-2 lg:hidden">
                {filtered.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{memberName(member)}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {member.user.email}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            member.user.email_verified
                              ? "border-success/20 bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {member.user.email_verified ? "Verified" : "Unverified"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Joined {formatDate(member.created_at)}
                        </span>
                      </div>
                    </div>
                    <MemberActionsMenu
                      member={member}
                      canManageMembers={canManageMembers}
                      onView={setViewing}
                      onRemove={setRemoving}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <MemberDetailSheet
        key={viewing?.id ?? "closed"}
        gymId={gymId}
        member={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing ? memberName(removing) : "this member"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll lose their membership at this gym. This can&apos;t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? <p className="px-1 text-sm text-destructive">{removeError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeBusy}
              onClick={handleConfirmRemove}
            >
              {removeBusy ? <Loader2 className="animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
