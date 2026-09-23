import "server-only";

import { NotificationType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createNotification } from "@/services/notifications";
import { Errors } from "@/lib/errors";

export type ListAdvertisersInput = {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
};

export async function listAdvertisers(input: ListAdvertisersInput = {}) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);

  const where = {
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.search
      ? {
          OR: [
            { businessName: { contains: input.search, mode: "insensitive" as const } },
            { businessEmail: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.advertiserProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, email: true } },
        wallet: { select: { availableBalance: true, totalFunded: true, totalSpent: true } },
        campaigns: { select: { id: true, name: true, status: true } },
      },
    }),
    prisma.advertiserProfile.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdvertiserDetail(advertiserId: string) {
  const advertiser = await prisma.advertiserProfile.findUnique({
    where: { id: advertiserId },
    include: {
      user: { include: { profile: true } },
      wallet: true,
      members: { include: { user: { select: { id: true, email: true } } } },
      campaigns: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { opportunities: true } } },
      },
      reviewedBy: { select: { id: true, email: true } },
    },
  });
  if (!advertiser) throw Errors.notFound("Advertiser not found.");
  return advertiser;
}

async function setAdvertiserStatus(input: {
  advertiserId: string;
  status: string;
  actorId: string;
  note?: string;
  action: string;
  notifyMessage: string;
  ip?: string | null;
}) {
  const advertiser = await prisma.advertiserProfile.findUnique({
    where: { id: input.advertiserId },
  });
  if (!advertiser) throw Errors.notFound("Advertiser not found.");

  const data: Record<string, unknown> = { status: input.status as never };
  if (input.note !== undefined) {
    data.rejectionReason = input.note;
  }
  if (input.action.endsWith("APPROVED") || input.action.endsWith("REJECTED")) {
    data.reviewedAt = new Date();
    data.reviewedById = input.actorId;
  }

  await prisma.advertiserProfile.update({
    where: { id: input.advertiserId },
    data: data as never,
  });

  // A suspended advertiser's active campaigns cannot keep spending budget or
  // earning completions. Pause them deterministically.
  if (input.status === "SUSPENDED") {
    await prisma.campaign.updateMany({
      where: { advertiserId: input.advertiserId, status: "ACTIVE" },
      data: { status: "PAUSED", pausedAt: new Date() } as never,
    });
    await prisma.opportunity.updateMany({
      where: { advertiserId: input.advertiserId, status: "ACTIVE" },
      data: { status: "PAUSED" } as never,
    });
  }

  await audit({
    userId: input.actorId,
    action: input.action,
    entityType: "AdvertiserProfile",
    entityId: input.advertiserId,
    meta: { note: input.note ?? null },
    ip: input.ip,
  });
  await createNotification({
    userId: advertiser.userId,
    type:
      input.status === "SUSPENDED"
        ? NotificationType.ADVERTISER_SUSPENDED
        : input.status === "ACTIVE"
          ? NotificationType.ADVERTISER_APPROVED
          : NotificationType.ADVERTISER_REJECTED,
    title: "Advertiser account update",
    message: input.notifyMessage,
  });

  return advertiser;
}

export async function approveAdvertiser(input: {
  advertiserId: string;
  actorId: string;
  note?: string;
  ip?: string | null;
}) {
  return setAdvertiserStatus({
    ...input,
    status: "ACTIVE",
    action: "ADVERTISER.ADMIN_APPROVED",
    notifyMessage: "Your advertiser account has been approved. You can go live.",
  });
}

export async function rejectAdvertiser(input: {
  advertiserId: string;
  actorId: string;
  note: string;
  ip?: string | null;
}) {
  return setAdvertiserStatus({
    ...input,
    status: "REJECTED",
    action: "ADVERTISER.ADMIN_REJECTED",
    notifyMessage: `Your advertiser account was not approved. Reason: ${input.note}`,
  });
}

export async function suspendAdvertiser(input: {
  advertiserId: string;
  actorId: string;
  note: string;
  ip?: string | null;
}) {
  return setAdvertiserStatus({
    ...input,
    status: "SUSPENDED",
    action: "ADVERTISER.ADMIN_SUSPENDED",
    notifyMessage: `Your advertiser account has been suspended. Reason: ${input.note}`,
  });
}

export async function reactivateAdvertiser(input: {
  advertiserId: string;
  actorId: string;
  note?: string;
  ip?: string | null;
}) {
  const change = await prisma.advertiserProfile.updateMany({
    where: { id: input.advertiserId, status: "SUSPENDED" },
    data: { status: "ACTIVE" } as never,
  });
  if (change.count !== 1) {
    throw Errors.conflict("Advertiser is not suspended or does not exist.", "INVALID_STATE");
  }
  await audit({
    userId: input.actorId,
    action: "ADVERTISER.ADMIN_REACTIVATED",
    entityType: "AdvertiserProfile",
    entityId: input.advertiserId,
    meta: { note: input.note ?? null },
    ip: input.ip,
  });
  await createNotification({
    userId: (await prisma.advertiserProfile.findUnique({ where: { id: input.advertiserId } }))
      ?.userId ?? "",
    type: NotificationType.ADVERTISER_REACTIVATED,
    title: "Advertiser account reactivated",
    message: "Your advertiser account is active again.",
  });

  return { advertiserId: input.advertiserId };
}