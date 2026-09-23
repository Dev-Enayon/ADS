import "server-only";

import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import {
  adminPauseCampaign,
  adminResumeCampaign,
  approveCampaign,
  rejectCampaign,
} from "@/services/campaigns";

export type ListCampaignsInput = {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
};

export async function listCampaigns(input: ListCampaignsInput = {}) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);

  const where = {
    ...(input.status ? { status: input.status as never } : {}),
    ...(input.search
      ? { name: { contains: input.search, mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        advertiser: { select: { id: true, businessName: true } },
        reviewedBy: { select: { id: true, email: true } },
        _count: { select: { opportunities: true, creatives: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getCampaignDetail(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      advertiser: {
        include: {
          user: { select: { id: true, email: true } },
          wallet: true,
        },
      },
      reviewedBy: { select: { id: true, email: true } },
      opportunities: { orderBy: { createdAt: "desc" } },
      creatives: true,
      fundingRecords: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  return campaign;
}

export async function moderateCampaign(input: {
  campaignId: string;
  action: "approve" | "reject";
  actorId: string;
  reason?: string;
  ip?: string | null;
}) {
  if (input.action === "approve") {
    return approveCampaign(input.campaignId, input.actorId, { ip: input.ip });
  }
  return rejectCampaign(
    input.campaignId,
    input.actorId,
    input.reason ?? "Rejected by an administrator.",
    { ip: input.ip },
  );
}

export async function pauseCampaignAdmin(input: {
  campaignId: string;
  actorId: string;
  reason?: string;
  ip?: string | null;
}) {
  await adminPauseCampaign(input.campaignId, input.actorId, {
    ip: input.ip,
    reason: input.reason,
  });
}

export async function resumeCampaignAdmin(input: {
  campaignId: string;
  actorId: string;
  reason?: string;
  ip?: string | null;
}) {
  await adminResumeCampaign(input.campaignId, input.actorId, {
    ip: input.ip,
    reason: input.reason,
  });
}