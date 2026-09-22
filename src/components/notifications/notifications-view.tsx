"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BellIcon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/client-api";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

const typeTone: Record<string, "neutral" | "success" | "warning" | "info" | "primary" | "danger"> = {
  REWARD_RECEIVED: "success",
  WITHDRAWAL_CREATED: "info",
  WITHDRAWAL_UPDATED: "info",
  ACCOUNT_STATUS: "warning",
  SYSTEM: "neutral",
  REFERRAL: "primary",
  CAMPAIGN: "primary",
  SECURITY: "danger",
};

export function NotificationsView({
  unread,
  initialNotifications,
  initialTotal,
}: {
  unread: number;
  initialNotifications: Notification[];
  initialTotal: number;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(unread);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
      router.refresh();
    } catch {
      // non-fatal
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
      router.refresh();
    } catch {
      // non-fatal
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
              : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader
          title="Recent"
          subtitle={initialTotal > 50 ? `Showing the latest 50 of ${initialTotal}` : undefined}
        />
        <CardBody>
          {notifications.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              <BellIcon className="mx-auto mb-2 text-muted-soft" />
              No notifications yet. Rewards, withdrawals and security alerts will show up here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.read && markRead(n.id)}
                    className={cn(
                      "flex w-full items-start gap-3 py-3 text-left",
                      !n.read && "cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.read ? "bg-border-strong" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{n.title}</span>
                        <Badge tone={typeTone[n.type] ?? "neutral"}>{n.type}</Badge>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{n.message}</span>
                      <span className="mt-0.5 block text-xs text-muted-soft">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-center text-xs text-muted">
            <Link href="/dashboard" className="font-medium text-primary hover:underline">
              Back to dashboard
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}