"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
} from "@/lib/api/notifications";
import { usePushSubscription } from "@/lib/notifications/use-push-subscription";
import type { NotificationSummary } from "@/types/api";

const POLL_MS = 30_000;

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const { permission, busy, subscribe } = usePushSubscription();

  // Polls rather than a websocket -- no realtime infra exists elsewhere in
  // this app, and this matches the setInterval pattern already used for
  // other semi-live data (e.g. the workout session timer, the check-in QR
  // refresh).
  useEffect(() => {
    const poll = () => {
      getUnreadNotificationCount()
        .then((res) => setUnreadCount(res.count))
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    getNotifications(1)
      .then((res) => setNotifications(res.results))
      .catch(() => setNotifications([]));
  }, [open]);

  const handleRead = (notification: NotificationSummary) => {
    if (notification.read_at) return;
    markNotificationRead(notification.id)
      .then((updated) => {
        setNotifications((prev) => prev?.map((n) => (n.id === updated.id ? updated : n)) ?? null);
        setUnreadCount((count) => Math.max(0, count - 1));
      })
      .catch(() => {});
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="Notifications" />}
      >
        <span className="relative inline-flex">
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-4 min-w-4 justify-center px-1 text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        </DropdownMenuGroup>
        {permission === "default" ? (
          <div className="px-1.5 py-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => void subscribe()}
            >
              Enable push notifications
            </Button>
          </div>
        ) : null}
        <DropdownMenuSeparator />
        {notifications === null ? (
          <p className="px-1.5 py-2 text-sm text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="px-1.5 py-2 text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex-col items-start gap-0.5 whitespace-normal"
              onClick={() => handleRead(notification)}
            >
              <span className={notification.read_at ? "text-sm" : "text-sm font-medium"}>
                {notification.title}
              </span>
              <span className="text-xs text-muted-foreground">{notification.message}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
