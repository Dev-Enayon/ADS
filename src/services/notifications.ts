import "server-only";

import { prisma } from "@/lib/db";
import type { NotificationType } from "@/generated/prisma/enums";

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
};

export async function createNotification(input: NewNotification): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
    },
  });
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ notifications: Awaited<ReturnType<typeof fetchRows>>; total: number; unread: number }> {
  const limit = opts.limit ?? 30;
  const offset = opts.offset ?? 0;
  const [notifications, total, unread] = await Promise.all([
    fetchRows(userId, limit, offset),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return { notifications, total, unread };
}

async function fetchRows(userId: string, limit: number, offset: number) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
  return result.count === 1;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return result.count;
}