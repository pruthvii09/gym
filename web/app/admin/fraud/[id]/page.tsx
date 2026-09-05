"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Ban, Check, Loader2, ShieldOff, UserCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getFraudReview, listFraudEvents, resolveFraudReview } from "@/lib/api/fraud";
import { blockRewardClaims, getAdminUser, setUserActive } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import {
  FRAUD_EVENT_TYPE_LABEL,
  FRAUD_REVIEW_STATUS_LABEL,
  FRAUD_REVIEW_STATUS_TONE,
  FRAUD_RISK_LABEL,
  FRAUD_RISK_TONE,
} from "@/lib/fraud-status";
import { cn } from "@/lib/utils";
import type { AdminFraudEvent, AdminFraudReview, AdminUser } from "@/types/api";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventSummaryRow({ event }: { event: AdminFraudEvent }) {
  return (
    <li className="space-y-1 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="bg-muted text-xs text-muted-foreground">
          {FRAUD_EVENT_TYPE_LABEL[event.event_type]}
        </Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
      </div>
      {event.details ? <p className="text-xs text-muted-foreground">{event.details}</p> : null}
      {event.checkin_gym_name ? (
        <p className="text-xs text-muted-foreground">
          At {event.checkin_gym_name}
          {event.checkin_checked_in_at ? ` — ${formatDateTime(event.checkin_checked_in_at)}` : ""}
        </p>
      ) : null}
    </li>
  );
}

export default function AdminFraudReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const [review, setReview] = useState<AdminFraudReview | null>(null);
  const [events, setEvents] = useState<AdminFraudEvent[] | null>(null);
  const [targetUser, setTargetUser] = useState<AdminUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [userActionBusy, setUserActionBusy] = useState(false);
  const [userActionMessage, setUserActionMessage] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState<string | null>(null);

  const load = () => {
    getFraudReview(params.id)
      .then((r) => {
        setReview(r);
        getAdminUser(r.user)
          .then(setTargetUser)
          .catch(() => setTargetUser(null));
        listFraudEvents({ user: r.user })
          .then((res) => setEvents(res.results))
          .catch(() => setEvents([]));
      })
      .catch(() => setLoadError("Couldn't load this review."));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleResolve = async (status: "approved" | "rejected") => {
    setResolving(true);
    setResolveError(null);
    try {
      const updated = await resolveFraudReview(params.id, {
        status,
        resolution_notes: notes,
      });
      setReview(updated);
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : "Couldn't resolve this review.");
    } finally {
      setResolving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!targetUser) return;
    setUserActionBusy(true);
    setUserActionError(null);
    setUserActionMessage(null);
    try {
      const updated = await setUserActive(targetUser.id, !targetUser.is_active);
      setTargetUser(updated);
      setUserActionMessage(updated.is_active ? "User restored." : "User suspended.");
    } catch (err) {
      setUserActionError(err instanceof ApiError ? err.message : "Couldn't update this user.");
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleBlockClaims = async () => {
    if (!targetUser) return;
    setUserActionBusy(true);
    setUserActionError(null);
    setUserActionMessage(null);
    try {
      await blockRewardClaims(targetUser.id);
      setUserActionMessage("Reward claims blocked for this user.");
    } catch (err) {
      setUserActionError(err instanceof ApiError ? err.message : "Couldn't block reward claims.");
    } finally {
      setUserActionBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" render={<Link href="/admin/fraud" />}>
          Back to fraud
        </Button>
      </div>
    );
  }

  if (!review) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/fraud"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to fraud
      </Link>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{review.user_email}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Opened {formatDateTime(review.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Badge variant="outline" className={cn("border", FRAUD_RISK_TONE[review.risk_level])}>
                {FRAUD_RISK_LABEL[review.risk_level]} risk
              </Badge>
              <Badge
                variant="outline"
                className={cn("border", FRAUD_REVIEW_STATUS_TONE[review.status])}
              >
                {FRAUD_REVIEW_STATUS_LABEL[review.status]}
              </Badge>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">{review.reason || "No reason recorded."}</p>
          {review.status !== "open" ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">
                Resolved {review.resolved_at ? formatDateTime(review.resolved_at) : "—"} by{" "}
                {review.resolved_by_email ?? "—"}
              </p>
              {review.resolution_notes ? (
                <p className="mt-1 whitespace-pre-wrap">{review.resolution_notes}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {review.status === "open" ? (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">Resolve this review</p>
            <Textarea
              placeholder="Resolution notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleResolve("approved")} disabled={resolving}>
                {resolving ? <Loader2 className="animate-spin" /> : <Check />}
                Confirm fraud
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => handleResolve("rejected")}
                disabled={resolving}
              >
                <X />
                Dismiss as false positive
              </Button>
            </div>
            {resolveError ? <p className="text-sm text-destructive">{resolveError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {targetUser ? (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">Quick actions for {targetUser.email}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className={targetUser.is_active ? "text-destructive hover:text-destructive" : ""}
                onClick={handleToggleActive}
                disabled={userActionBusy}
              >
                {userActionBusy ? (
                  <Loader2 className="animate-spin" />
                ) : targetUser.is_active ? (
                  <Ban />
                ) : (
                  <UserCheck />
                )}
                {targetUser.is_active ? "Suspend user" : "Restore user"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleBlockClaims} disabled={userActionBusy}>
                <ShieldOff />
                Block reward claims
              </Button>
            </div>
            {userActionMessage ? (
              <p className="text-sm text-success">{userActionMessage}</p>
            ) : null}
            {userActionError ? <p className="text-sm text-destructive">{userActionError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Recent fraud events for this user</p>
        {events === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No events on record.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <EventSummaryRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
