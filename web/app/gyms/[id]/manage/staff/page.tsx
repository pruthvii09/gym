"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  createGymStaffInvite,
  listGymStaff,
  listGymStaffInvites,
  removeGymStaff,
  revokeGymStaffInvite,
  updateGymStaffRole,
} from "@/lib/api/gym-manage";
import { ApiError } from "@/lib/api/client";
import { useGymManageContext } from "../gym-manage-context";
import type { GymMember, GymMembershipRole, GymStaffInviteSummary, GymStaffRole } from "@/types/api";

const ROLE_LABEL: Record<GymMembershipRole, string> = {
  member: "Member",
  staff: "Staff",
  manager: "Manager",
  owner: "Owner",
};

const INVITE_STATUS_TONE: Record<GymStaffInviteSummary["status"], string> = {
  pending: "bg-warning/10 text-warning border-warning/25",
  accepted: "bg-success/10 text-success border-success/20",
  revoked: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

// Mirrors apps.gyms.services.assert_can_manage_role -- client-side only for
// hiding actions the backend would 403 anyway; the backend is still the
// real enforcement.
function canManage(actorRole: GymMembershipRole, targetRole: GymMembershipRole) {
  if (actorRole === "owner") return true;
  if (actorRole === "manager") return targetRole === "staff";
  return false;
}

function rolesInviteableBy(actorRole: GymMembershipRole): GymStaffRole[] {
  if (actorRole === "owner") return ["staff", "manager", "owner"];
  if (actorRole === "manager") return ["staff"];
  return [];
}

const inviteSchema = z.object({
  email: z.string().min(1, "Email is required"),
  role: z.enum(["staff", "manager", "owner"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

function StaffRow({
  member,
  actorRole,
  onChanged,
}: {
  member: GymMember;
  actorRole: GymMembershipRole;
  onChanged: () => void;
}) {
  const { gymId } = useGymManageContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manageable = canManage(actorRole, member.role);
  const otherRoles = (["staff", "manager", "owner"] as const).filter((r) => r !== member.role);

  const handleRoleChange = async (role: GymStaffRole) => {
    setBusy(true);
    setError(null);
    try {
      await updateGymStaffRole(gymId, member.id, role);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change role.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeGymStaff(gymId, member.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove this person.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {[member.user.first_name, member.user.last_name].filter(Boolean).join(" ") ||
              member.user.email}
          </p>
          <p className="text-sm text-muted-foreground">{member.user.email}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {ROLE_LABEL[member.role]}
        </Badge>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {manageable ? (
        <div className="flex flex-wrap gap-2">
          {otherRoles
            .filter((r) => r !== "owner" || actorRole === "owner")
            .map((r) => (
              <Button
                key={r}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => handleRoleChange(r)}
              >
                Make {ROLE_LABEL[r]}
              </Button>
            ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={handleRemove}
          >
            {busy ? <Loader2 className="animate-spin" /> : <X />}
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export default function GymStaffPage() {
  const { gymId, role: actorRole } = useGymManageContext();
  const [staff, setStaff] = useState<GymMember[] | null>(null);
  const [invites, setInvites] = useState<GymStaffInviteSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const loadStaff = () => {
    listGymStaff(gymId)
      .then((res) => setStaff(res.results))
      .catch(() => {
        setStaff([]);
        setListError("Couldn't load staff. Refresh to try again.");
      });
  };

  const loadInvites = () => {
    listGymStaffInvites(gymId)
      .then(setInvites)
      .catch(() => setInvites([]));
  };

  useEffect(() => {
    loadStaff();
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId]);

  const inviteableRoles = rolesInviteableBy(actorRole);

  const {
    register: field,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: inviteableRoles[0] ?? "staff" },
  });

  const onInvite = async (values: InviteFormValues) => {
    setInviteError(null);
    setInviteSuccess(null);
    try {
      await createGymStaffInvite(gymId, values.email, values.role);
      setInviteSuccess(`Invite sent to ${values.email}.`);
      reset({ email: "", role: inviteableRoles[0] ?? "staff" });
      loadInvites();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Couldn't send this invite.");
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await revokeGymStaffInvite(gymId, inviteId);
      loadInvites();
    } catch {
      // surfaced implicitly -- the invite just stays pending in the list
    }
  };

  const pendingInvites = (invites ?? []).filter((invite) => invite.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="mt-1 text-muted-foreground">
          People who help run this gym — front desk, management, ownership.
        </p>
      </div>

      <Card>
        <CardContent>
          {listError ? <p className="mb-3 text-sm text-destructive">{listError}</p> : null}
          {staff === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {staff.map((member) => (
                <StaffRow
                  key={member.id}
                  member={member}
                  actorRole={actorRole}
                  onChanged={loadStaff}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {inviteableRoles.length > 0 ? (
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">Invite staff</p>
            <form
              onSubmit={handleSubmit(onInvite)}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="space-y-1.5 sm:flex-1">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="staff@example.com"
                  aria-invalid={!!errors.email}
                  {...field("email")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Controller
                  control={control}
                  name="role"
                  render={({ field: roleField }) => (
                    <Select
                      value={roleField.value}
                      onValueChange={roleField.onChange}
                      items={Object.fromEntries(inviteableRoles.map((r) => [r, ROLE_LABEL[r]]))}
                    >
                      <SelectTrigger id="invite-role" className="w-full sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {inviteableRoles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <Button type="submit" variant="gradient" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Send invite
              </Button>
            </form>
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
            {inviteError ? (
              <Alert className="border-destructive/25 bg-destructive/5 text-destructive">
                <AlertDescription className="text-current">{inviteError}</AlertDescription>
              </Alert>
            ) : null}
            {inviteSuccess ? (
              <Alert className="border-success/25 bg-success/5 text-success">
                <AlertDescription className="text-current">{inviteSuccess}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {pendingInvites.length > 0 ? (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">Pending invites</p>
            <ul className="space-y-2">
              {pendingInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Mail className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited as {ROLE_LABEL[invite.role]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={INVITE_STATUS_TONE[invite.status]}>
                      {invite.status}
                    </Badge>
                    {canManage(actorRole, invite.role) ? (
                      <Button variant="ghost" size="sm" onClick={() => handleRevoke(invite.id)}>
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
