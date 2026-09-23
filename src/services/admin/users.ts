import "server-only";

import { NotificationType, UserRole, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createNotification } from "@/services/notifications";
import { Errors } from "@/lib/errors";

export type ListUsersInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: UserStatus;
  role?: UserRole;
};

export async function listUsers(input: ListUsersInput = {}) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);

  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.search
      ? { email: { contains: input.search, mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { fullName: true } },
        wallet: { select: { availableBalance: true, pendingBalance: true, totalWithdrawn: true } },
        _count: { select: { withdrawals: true, rewards: true, sessions: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      wallet: true,
      referredBy: { select: { id: true, email: true } },
      riskEvents: { orderBy: { createdAt: "desc" }, take: 25 },
      sessions: {
        orderBy: { lastActiveAt: "desc" },
        take: 10,
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastActiveAt: true,
          revokedAt: true,
          expiresAt: true,
        },
      },
      _count: { select: { rewards: true, withdrawals: true, referralsGiven: true, watchSessions: true } },
    },
  });
  if (!user) throw Errors.notFound("User not found.");
  return user;
}

export async function suspendUser(input: {
  userId: string;
  actorId: string;
  reason: string;
  ip?: string | null;
}) {
  const user = await prisma.user.updateMany({
    where: { id: input.userId, status: { not: UserStatus.SUSPENDED } },
    data: { status: UserStatus.SUSPENDED },
  });
  if (user.count !== 1) {
    throw Errors.conflict("User is already suspended or does not exist.", "INVALID_STATE");
  }

  // Kill active sessions so a suspension takes effect immediately.
  await prisma.session.updateMany({
    where: { userId: input.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await audit({
    userId: input.actorId,
    action: "USER.ADMIN_SUSPENDED",
    entityType: "User",
    entityId: input.userId,
    meta: { reason: input.reason },
    ip: input.ip,
  });
  await createNotification({
    userId: input.userId,
    type: NotificationType.ACCOUNT_SUSPENDED,
    title: "Account suspended",
    message: `Your account has been suspended. Reason: ${input.reason}`,
  });
}

export async function reactivateUser(input: {
  userId: string;
  actorId: string;
  reason?: string;
  ip?: string | null;
}) {
  const user = await prisma.user.updateMany({
    where: { id: input.userId, status: UserStatus.SUSPENDED },
    data: { status: UserStatus.ACTIVE },
  });
  if (user.count !== 1) {
    throw Errors.conflict("User is not suspended or does not exist.", "INVALID_STATE");
  }

  await audit({
    userId: input.actorId,
    action: "USER.ADMIN_REACTIVATED",
    entityType: "User",
    entityId: input.userId,
    meta: { reason: input.reason ?? null },
    ip: input.ip,
  });
  await createNotification({
    userId: input.userId,
    type: NotificationType.ACCOUNT_REACTIVATED,
    title: "Account reactivated",
    message: "Your account has been reactivated. Welcome back.",
  });
}

/**
 * Role assignment. SUPER_ADMIN is the only role that can call this (enforced
 * in the API layer) and a user can never demote themselves, so a misconfigured
 * client cannot lock the last super admin out of the console.
 */
export async function setUserRole(input: {
  userId: string;
  actorId: string;
  role: UserRole;
  ip?: string | null;
}) {
  if (input.userId === input.actorId && input.role === UserRole.USER) {
    throw Errors.conflict("You cannot remove your own admin role.", "SELF_DEMOTE");
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { role: input.role },
    select: { id: true, email: true, role: true },
  });

  await audit({
    userId: input.actorId,
    action: "USER.ROLE_CHANGED",
    entityType: "User",
    entityId: input.userId,
    meta: { role: input.role },
    ip: input.ip,
  });
  await createNotification({
    userId: input.userId,
    type: NotificationType.ACCOUNT_STATUS,
    title: "Permissions updated",
    message: `Your platform role is now ${input.role}.`,
  });
  return updated;
}