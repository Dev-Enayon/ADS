import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { listNotifications } from "@/services/notifications";
import { NotificationsView } from "@/components/notifications/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const { notifications, total, unread } = await listNotifications(user.id, { limit: 50 });

  return (
    <NotificationsView
      unread={unread}
      initialNotifications={notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      }))}
      initialTotal={total}
    />
  );
}