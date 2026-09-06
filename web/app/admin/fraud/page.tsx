"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Loader2, ShieldAlert, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReviewFromEvents, listFraudEvents, listFraudReviews, resolveFraudReview } from "@/lib/api/fraud";
import { ApiError } from "@/lib/api/client";
import {
  FRAUD_EVENT_TYPE_LABEL,
  FRAUD_REVIEW_STATUS_LABEL,
  FRAUD_REVIEW_STATUS_TONE,
  FRAUD_RISK_LABEL,
  FRAUD_RISK_TONE,
} from "@/lib/fraud-status";
import { cn } from "@/lib/utils";
import type {
  AdminFraudEvent,
  AdminFraudReview,
  FraudEventType,
  FraudReviewStatus,
  FraudRiskLevel,
} from "@/types/api";

type ViewMode = "reviews" | "events";

const STATUS_TABS: { label: string; value: FraudReviewStatus | "all" }[] = [
  { label: "Open", value: "open" },
  { label: "Confirmed", value: "approved" },
  { label: "Dismissed", value: "rejected" },
  { label: "All", value: "all" },
];

const RISK_LEVELS: FraudRiskLevel[] = ["high", "medium", "low"];

const EVENT_TYPES: FraudEventType[] = [
  "qr_reuse",
  "gps_mismatch",
  "too_many_checkins",
  "impossible_travel",
  "multiple_accounts_device",
  "suspicious_pattern",
  "device_anomaly",
  "suspicious_account_creation",
  "suspicious_reward_claim",
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReviewRow({
  review,
  onChanged,
}: {
  review: AdminFraudReview;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async (status: "approved" | "rejected") => {
    setBusy(true);
    setError(null);
    try {
      await resolveFraudReview(review.id, { status, resolution_notes: notes });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resolve this review.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{review.user_email}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{review.reason || "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Opened {formatDateTime(review.created_at)}
            {review.resolved_at
              ? ` · resolved ${formatDateTime(review.resolved_at)} by ${review.resolved_by_email ?? "—"}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant="outline" className={cn("border", FRAUD_RISK_TONE[review.risk_level])}>
            {FRAUD_RISK_LABEL[review.risk_level]} risk
          </Badge>
          <Badge variant="outline" className={cn("border", FRAUD_REVIEW_STATUS_TONE[review.status])}>
            {FRAUD_REVIEW_STATUS_LABEL[review.status]}
          </Badge>
          <Button variant="ghost" size="icon-sm" render={<Link href={`/admin/fraud/${review.id}`} />}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {review.status === "open" ? (
        rejecting ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="Resolution notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="sm:flex-1"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleResolve("rejected")}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                Confirm dismiss
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResolve("approved")}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Confirm fraud
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setRejecting(true)}
              disabled={busy}
            >
              <X />
              Dismiss
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
}

function ReviewsView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusParam = searchParams.get("status");
  const activeStatus: FraudReviewStatus | "all" =
    statusParam === "approved" || statusParam === "rejected" || statusParam === "all"
      ? statusParam
      : "open";

  const [riskLevel, setRiskLevel] = useState<FraudRiskLevel | "">("");
  const [search, setSearch] = useState("");
  const [reviews, setReviews] = useState<AdminFraudReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listFraudReviews({
      status: activeStatus,
      risk_level: riskLevel || undefined,
      search: search || undefined,
    })
      .then((res) => setReviews(res.results))
      .catch(() => {
        setReviews([]);
        setError("Couldn't load fraud reviews. Refresh to try again.");
      });
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setReviews(null);
      load();
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, riskLevel, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => router.push(`/admin/fraud?view=reviews&status=${tab.value}`)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeStatus === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-56"
          />
          <Select
            value={riskLevel || "all"}
            onValueChange={(v) => setRiskLevel(v === "all" ? "" : (v as FraudRiskLevel))}
            items={{ all: "All risk levels", ...Object.fromEntries(RISK_LEVELS.map((r) => [r, FRAUD_RISK_LABEL[r]])) }}
          >
            <SelectTrigger className="w-full sm:w-40 sm:shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk levels</SelectItem>
              {RISK_LEVELS.map((r) => (
                <SelectItem key={r} value={r}>
                  {FRAUD_RISK_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {reviews === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : reviews.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No reviews in this list.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <ReviewRow key={review.id} review={review} onChanged={load} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventRow({
  event,
  selected,
  onToggle,
}: {
  event: AdminFraudEvent;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <Checkbox checked={selected} onCheckedChange={(v) => onToggle(v === true)} className="mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{event.user_email}</p>
          <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
        </div>
        <Badge variant="outline" className="bg-muted text-xs text-muted-foreground">
          {FRAUD_EVENT_TYPE_LABEL[event.event_type]}
        </Badge>
        {event.details ? <p className="text-xs text-muted-foreground">{event.details}</p> : null}
        {event.checkin_gym_name ? (
          <p className="text-xs text-muted-foreground">
            At {event.checkin_gym_name}
            {event.checkin_checked_in_at ? ` — ${formatDateTime(event.checkin_checked_in_at)}` : ""}
          </p>
        ) : null}
        {event.review ? (
          <Link
            href={`/admin/fraud/${event.review}`}
            className="text-xs text-primary hover:underline"
          >
            Linked to a review →
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function EventsView() {
  const router = useRouter();
  const [eventType, setEventType] = useState<FraudEventType | "">("");
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<AdminFraudEvent[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [escalating, setEscalating] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [escalateError, setEscalateError] = useState<string | null>(null);

  const load = () => {
    listFraudEvents({ event_type: eventType || undefined, search: search || undefined })
      .then((res) => {
        setEvents(res.results);
        setSelected(new Set());
      })
      .catch(() => {
        setEvents([]);
        setError("Couldn't load fraud events. Refresh to try again.");
      });
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setEvents(null);
      load();
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, search]);

  const selectedEvents = (events ?? []).filter((e) => selected.has(e.id));
  const selectedUsers = new Set(selectedEvents.map((e) => e.user));
  const canEscalate = selectedEvents.length > 0 && selectedUsers.size === 1;

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleEscalate = async () => {
    setEscalating(true);
    setEscalateError(null);
    try {
      const review = await createReviewFromEvents({
        event_ids: [...selected],
        reason: escalateReason,
      });
      router.push(`/admin/fraud/${review.id}`);
    } catch (err) {
      setEscalateError(err instanceof ApiError ? err.message : "Couldn't create a review.");
      setEscalating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search by email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-56"
        />
        <Select
          value={eventType || "all"}
          onValueChange={(v) => setEventType(v === "all" ? "" : (v as FraudEventType))}
          items={{
            all: "All event types",
            ...Object.fromEntries(EVENT_TYPES.map((t) => [t, FRAUD_EVENT_TYPE_LABEL[t]])),
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {FRAUD_EVENT_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 ? (
        <Card className="border-primary/25 bg-primary/5">
          <CardContent className="space-y-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {selected.size} event{selected.size === 1 ? "" : "s"} selected
                {!canEscalate && selectedUsers.size > 1
                  ? " — must all belong to the same user"
                  : ""}
              </p>
              {!escalating ? (
                <Button size="sm" disabled={!canEscalate} onClick={() => setEscalating(true)}>
                  <ShieldAlert />
                  Create review from selected
                </Button>
              ) : null}
            </div>
            {escalating ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  placeholder="Reason (optional)"
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  className="sm:flex-1"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleEscalate}>
                    Confirm
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEscalating(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            {escalateError ? <p className="text-xs text-destructive">{escalateError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {events === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No events found.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  selected={selected.has(event.id)}
                  onToggle={(checked) => toggle(event.id, checked)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminFraudContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode: ViewMode = searchParams.get("view") === "events" ? "events" : "reviews";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fraud</h1>
        <p className="mt-1 text-muted-foreground">
          Review flagged accounts and the signals behind them.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => router.push("/admin/fraud?view=reviews")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "reviews" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Reviews
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/fraud?view=events")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "events" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Event log
        </button>
      </div>

      {mode === "reviews" ? <ReviewsView /> : <EventsView />}
    </div>
  );
}

export default function AdminFraudPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AdminFraudContent />
    </Suspense>
  );
}
