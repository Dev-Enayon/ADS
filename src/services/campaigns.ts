import "server-only";

import { CampaignStatus, NotificationType, OpportunityStatus, OpportunitySource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { createNotification } from "@/services/notifications";
import { campaignRules, advertiserReviewMode } from "@/lib/settings";
import { allocateToCampaign } from "@/services/funding";
import {
  requireAdvertiserContext,
  assertRole,
  assertAdvertiserActive,
} from "@/lib/auth/advertiser";
import { formatMoney } from "@/lib/money";
import { probeVideoUrl } from "@/lib/media/probe";

const CANCELLABLE = new Set<string>([
  CampaignStatus.DRAFT,
  CampaignStatus.REJECTED,
  CampaignStatus.PENDING_REVIEW,
  CampaignStatus.APPROVED,
  CampaignStatus.SCHEDULED,
  CampaignStatus.PAUSED,
  CampaignStatus.ACTIVE,
]);
const TERMINAL = new Set<string>([
  CampaignStatus.COMPLETED,
  CampaignStatus.EXPIRED,
  CampaignStatus.CANCELLED,
]);

export type CampaignCreateInput = {
  name: string;
  description?: string;
  objective: CampaignObjectiveType;
  rewardPerCompletion: number;
  maxCompletions: number;
  startDate?: string | null;
  endDate?: string | null;
  targeting?: Record<string, unknown> | null;
};

// Objective values mirror the Database enum.
type CampaignObjectiveType =
  | "BRAND_AWARENESS"
  | "PRODUCT_LAUNCH"
  | "APP_INSTALL"
  | "LEAD_GENERATION"
  | "SALES_PROMOTION"
  | "ENGAGEMENT"
  | "OTHER";

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateSchedule(startDate: Date | null, endDate: Date | null) {
  if (startDate && endDate && startDate.getTime() >= endDate.getTime()) {
    throw Errors.validation("Start date must be before the end date.");
  }
}

export async function campaignRulesForPlatform() {
  return campaignRules();
}

/** A campaign can be fed to users' opportunity feed when the budget allows. */
export function isCampaignLiveForFeed(campaign: {
  status: string;
  remainingBudget: number;
  rewardPerCompletion: number;
  currentCompletions: number;
  maxCompletions: number;
  startDate: Date | null;
  endDate: Date | null;
  advertiser?: { status: string } | null;
}): boolean {
  if (campaign.status !== CampaignStatus.ACTIVE) return false;
  if (campaign.remainingBudget < campaign.rewardPerCompletion) return false;
  if (campaign.currentCompletions >= campaign.maxCompletions) return false;
  const now = Date.now();
  if (campaign.startDate && campaign.startDate.getTime() > now) return false;
  if (campaign.endDate && campaign.endDate.getTime() < now) return false;
  if (campaign.advertiser && campaign.advertiser.status !== "ACTIVE") return false;
  return true;
}

async function requireOwnedCampaign(advertiserId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId },
    include: { creatives: { orderBy: { createdAt: "asc" } }, opportunities: true },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  return campaign;
}

async function notifyOwner(
  advertiserId: string,
  type: NotificationType,
  title: string,
  message: string,
) {
  const advertiser = await prisma.advertiserProfile.findUnique({
    where: { id: advertiserId },
    select: { userId: true },
  });
  if (advertiser) {
    await createNotification({ userId: advertiser.userId, type, title, message }).catch(
      () => undefined,
    );
  }
}

export async function createCampaign(
  userId: string,
  input: CampaignCreateInput,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  assertAdvertiserActive(ctx);

  const rules = await campaignRules();
  if (input.rewardPerCompletion < rules.minReward || input.rewardPerCompletion > rules.maxReward) {
    throw Errors.validation(
      `Reward must be between ${formatMoney(rules.minReward)} and ${formatMoney(rules.maxReward)} per completion.`,
    );
  }
  if (input.maxCompletions < rules.minCompletions || input.maxCompletions > rules.maxCompletions) {
    throw Errors.validation(
      `Target completions must be between ${rules.minCompletions} and ${rules.maxCompletions}.`,
    );
  }

  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  validateSchedule(startDate, endDate);

  const budget = input.rewardPerCompletion * input.maxCompletions;
  if (budget <= 0 || budget > 1_000_000_000_000) {
    throw Errors.validation("The campaign budget is invalid.");
  }

  const campaign = await prisma.campaign.create({
    data: {
      advertiserId: ctx.advertiser.id,
      name: input.name,
      description: input.description ?? null,
      objective: input.objective,
      status: CampaignStatus.DRAFT,
      rewardPerCompletion: input.rewardPerCompletion,
      maxCompletions: input.maxCompletions,
      budget,
      startDate,
      endDate,
      targeting: (input.targeting as object) ?? undefined,
      createdBy: userId,
    },
  });

  await audit({
    userId,
    action: "CAMPAIGN.CREATED",
    entityType: "Campaign",
    entityId: campaign.id,
    meta: { name: campaign.name, budget, rewardPerCompletion: campaign.rewardPerCompletion },
    ip: opts.ip,
  });

  return { campaign, requiredBudget: budget, fundingNeeded: budget };
}

export async function updateCampaign(
  userId: string,
  campaignId: string,
  patch: Partial<Omit<CampaignCreateInput, "creative">>,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);

  const campaign = await requireOwnedCampaign(ctx.advertiser.id, campaignId);
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.REJECTED) {
    throw Errors.conflict("A campaign can only be edited before submission.", "INVALID_STATE");
  }

  const rules = await campaignRules();
  const data: Record<string, unknown> = { updatedBy: userId };

  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.objective !== undefined) data.objective = patch.objective;

  const reward = patch.rewardPerCompletion ?? campaign.rewardPerCompletion;
  const completions = patch.maxCompletions ?? campaign.maxCompletions;

  if (patch.rewardPerCompletion !== undefined) {
    if (reward < rules.minReward || reward > rules.maxReward) {
      throw Errors.validation(
        `Reward must be between ${formatMoney(rules.minReward)} and ${formatMoney(rules.maxReward)} per completion.`,
      );
    }
  }
  if (patch.maxCompletions !== undefined) {
    if (completions < rules.minCompletions || completions > rules.maxCompletions) {
      throw Errors.validation(
        `Target completions must be between ${rules.minCompletions} and ${rules.maxCompletions}.`,
      );
    }
  }

  const startDate = patch.startDate !== undefined ? parseDate(patch.startDate) : campaign.startDate;
  const endDate = patch.endDate !== undefined ? parseDate(patch.endDate) : campaign.endDate;
  validateSchedule(startDate, endDate);
  if (patch.startDate !== undefined) data.startDate = startDate;
  if (patch.endDate !== undefined) data.endDate = endDate;
  if (patch.targeting !== undefined) data.targeting = patch.targeting ?? undefined;

  // Budget is derived. Recompute it whenever reward/completions changed so the
  // server always owns the authoritative planned budget.
  if (patch.rewardPerCompletion !== undefined || patch.maxCompletions !== undefined) {
    data.budget = reward * completions;
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: data as never,
  });

  // Editing a rejected campaign sends it back to draft so it can be resubmitted.
  if (campaign.status === CampaignStatus.REJECTED) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.DRAFT, rejectionReason: null },
    });
    updated.status = CampaignStatus.DRAFT;
  }

  await audit({
    userId,
    action: "CAMPAIGN.UPDATED",
    entityType: "Campaign",
    entityId: campaign.id,
    meta: { fields: Object.keys(patch) },
    ip: opts.ip,
  });
  return updated;
}

async function buildOpportunityForCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      creatives: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } },
      advertiser: { select: { businessName: true } },
    },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  const creative = campaign.creatives[0];
  if (!creative || !creative.videoUrl) return null;

  const opportunity = {
    title: creative.title || campaign.name,
    description: campaign.description ?? `Sponsored campaign by ${campaign.advertiser.businessName}.`,
    videoUrl: creative.videoUrl,
    thumbnailUrl: creative.thumbnailUrl,
    durationSeconds: creative.durationSeconds,
    rewardAmount: campaign.rewardPerCompletion,
    source: OpportunitySource.ADVERTISER,
    advertiserId: campaign.advertiserId,
    campaignId: campaign.id,
    maxCompletions: campaign.maxCompletions,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
  };

  const existing = await prisma.opportunity.findFirst({ where: { campaignId: campaign.id } });
  if (existing) {
    return prisma.opportunity.update({
      where: { id: existing.id },
      data: { ...opportunity, currentCompletions: existing.currentCompletions },
    });
  }
  return prisma.opportunity.create({ data: { ...opportunity, status: OpportunityStatus.PAUSED } });
}

async function setOpportunityStatus(campaignId: string, status: OpportunityStatus) {
  await prisma.opportunity.updateMany({
    where: { campaignId, status: { not: status } },
    data: { status },
  });
}

/** Syncs the campaign opportunity to the active state (starts serving the feed). */
async function activateCampaignFeed(campaignId: string) {
  const opportunity = await buildOpportunityForCampaign(campaignId);
  if (!opportunity) return opportunity;
  await setOpportunityStatus(campaignId, OpportunityStatus.ACTIVE);
  return opportunity;
}

export async function submitCampaignForReview(
  userId: string,
  campaignId: string,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  assertAdvertiserActive(ctx);

  const campaign = await requireOwnedCampaign(ctx.advertiser.id, campaignId);
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.REJECTED) {
    throw Errors.conflict("This campaign cannot be submitted in its current state.", "INVALID_STATE");
  }

  const activeCreative = campaign.creatives.find((c) => c.status === "ACTIVE" && c.type === "VIDEO");
  if (!activeCreative) {
    throw Errors.validation("Add at least one video creative before submitting the campaign.");
  }

  const rules = await campaignRules();
  if (
    campaign.rewardPerCompletion < rules.minReward ||
    campaign.rewardPerCompletion > rules.maxReward ||
    campaign.maxCompletions < rules.minCompletions ||
    campaign.maxCompletions > rules.maxCompletions
  ) {
    throw Errors.validation("Campaign rules have changed; update reward and target before submitting.");
  }
  const desiredDuration = activeCreative.durationSeconds;
  if (desiredDuration < rules.minVideoSeconds || desiredDuration > rules.maxVideoSeconds) {
    throw Errors.validation(
      `Video length must be ${rules.minVideoSeconds}-${rules.maxVideoSeconds} seconds for sponsored content.`,
    );
  }

  // Server-side probe of the creative asset (best-effort).
  const probe = activeCreative.videoUrl
    ? await probeVideoUrl(activeCreative.videoUrl)
    : { durationSeconds: null, verified: false, contentType: null, unreachable: true };
  if (probe.unreachable) {
    // Do not hard-fail on transient probe timeouts in development; the asset
    // URL is still served. Record it for visibility.
    await audit({
      userId,
      action: "CREATIVE.PROBE_UNREACHABLE",
      entityType: "Creative",
      entityId: activeCreative.id,
      meta: { url: activeCreative.videoUrl },
      ip: opts.ip,
    });
  }

  // Reserve the remaining planned budget from the advertiser wallet.
  const needed = campaign.budget - campaign.allocatedAmount;
  if (needed > 0) {
    if (ctx.wallet && ctx.wallet.availableBalance >= needed) {
      await allocateToCampaign(userId, campaign.id, needed, { ip: opts.ip ?? undefined });
    } else {
      throw Errors.insufficientFunds(
        `Fund your campaign first. ${formatMoney(needed)} is still required to cover the planned budget.`,
      );
    }
  }

  const mode = await advertiserReviewMode();
  if (mode === "hold") {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.PENDING_REVIEW } as never,
    });
    await audit({
      userId,
      action: "CAMPAIGN.SUBMITTED",
      entityType: "Campaign",
      entityId: campaign.id,
      meta: { reviewMode: "hold" },
      ip: opts.ip,
    });
    return { campaign: await getCampaignDetail(ctx.advertiser.id, campaign.id), reviewMode: "hold" };
  }

  // Dev mode: auto-approve so the sponsored flow is fully testable.
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: CampaignStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedById: userId,
    } as never,
  });
  await audit({
    userId,
    action: "CAMPAIGN.SUBMITTED",
    entityType: "Campaign",
    entityId: campaign.id,
    meta: { reviewMode: "auto", note: "Dev auto-approval; production uses human review." },
    ip: opts.ip,
  });

  const activated = await activateOrSchedule(campaign.id, userId, opts.ip);
  return { campaign: await getCampaignDetail(ctx.advertiser.id, campaign.id), reviewMode: "auto", ...activated };
}

async function activateOrSchedule(
  campaignId: string,
  actorId: string,
  ip?: string | null,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw Errors.notFound("Campaign not found.");

  const now = new Date();
  const scheduled = campaign.startDate && campaign.startDate.getTime() > now.getTime();

  await prisma.campaign.update({
    where: { id: campaignId },
    data: scheduled
      ? { status: CampaignStatus.SCHEDULED }
      : { status: CampaignStatus.ACTIVE, startedAt: campaign.startedAt ?? now },
  } as never);

  await activateCampaignFeed(campaignId);

  await audit({
    userId: actorId,
    action: scheduled ? "CAMPAIGN.SCHEDULED" : "CAMPAIGN.ACTIVATED",
    entityType: "Campaign",
    entityId: campaignId,
    meta: { status: scheduled ? CampaignStatus.SCHEDULED : CampaignStatus.ACTIVE },
    ip,
  });
  await notifyOwner(
    campaign.advertiserId,
    NotificationType.CAMPAIGN_APPROVED,
    "Campaign approved",
    `"${campaign.name}" was approved and is ${scheduled ? "scheduled" : "now live"}.`,
  );

  return { status: scheduled ? CampaignStatus.SCHEDULED : CampaignStatus.ACTIVE };
}

/**
 * Approve a pending campaign (Part 3 admin consumption; the dev mode reaches
 * here internally through submitCampaignForReview's auto path  -- actually it
 * bypasses and activates directly. This is the human-review entry point).
 */
export async function approveCampaign(
  campaignId: string,
  reviewerId: string,
  opts: { ip?: string | null } = {},
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  if (campaign.status !== CampaignStatus.PENDING_REVIEW) {
    throw Errors.conflict("Campaign is not awaiting review.", "INVALID_STATE");
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.APPROVED, reviewedAt: new Date(), reviewedById: reviewerId },
  } as never);

  await audit({
    userId: reviewerId,
    action: "CAMPAIGN.APPROVED",
    entityType: "Campaign",
    entityId: campaignId,
    ip: opts.ip,
  });

  return activateOrSchedule(campaignId, reviewerId, opts.ip);
}

export async function rejectCampaign(
  campaignId: string,
  reviewerId: string,
  reason: string,
  opts: { ip?: string | null } = {},
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  if (campaign.status !== CampaignStatus.PENDING_REVIEW) {
    throw Errors.conflict("Campaign is not awaiting review.", "INVALID_STATE");
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.REJECTED, reviewedAt: new Date(), reviewedById: reviewerId, rejectionReason: reason },
  } as never);

  await audit({
    userId: reviewerId,
    action: "CAMPAIGN.REJECTED",
    entityType: "Campaign",
    entityId: campaignId,
    meta: { reason },
    ip: opts.ip,
  });
  await notifyOwner(
    campaign.advertiserId,
    NotificationType.CAMPAIGN_REJECTED,
    "Campaign rejected",
    `"${campaign.name}" was rejected: ${reason}`,
  );
}

export async function pauseCampaign(
  userId: string,
  campaignId: string,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  const campaign = await requireOwnedCampaign(ctx.advertiser.id, campaignId);

  if (campaign.status !== CampaignStatus.ACTIVE && campaign.status !== CampaignStatus.SCHEDULED) {
    throw Errors.conflict("Only active or scheduled campaigns can be paused.", "INVALID_STATE");
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.PAUSED, pausedAt: new Date() },
  } as never);
  await setOpportunityStatus(campaign.id, OpportunityStatus.PAUSED);
  await audit({
    userId,
    action: "CAMPAIGN.PAUSED",
    entityType: "Campaign",
    entityId: campaign.id,
    ip: opts.ip,
  });
  await notifyOwner(
    campaign.advertiserId,
    NotificationType.CAMPAIGN_PAUSED,
    "Campaign paused",
    `"${campaign.name}" has been paused and is no longer shown to viewers.`,
  );
}

export async function resumeCampaign(
  userId: string,
  campaignId: string,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  const campaign = await requireOwnedCampaign(ctx.advertiser.id, campaignId);
  if (campaign.status !== CampaignStatus.PAUSED) {
    throw Errors.conflict("Only paused campaigns can be resumed.", "INVALID_STATE");
  }

  if (campaign.remainingBudget < campaign.rewardPerCompletion) {
    throw Errors.badRequest("This campaign has no remaining budget.", "INSUFFICIENT_BUDGET");
  }
  if (campaign.currentCompletions >= campaign.maxCompletions) {
    throw Errors.badRequest("This campaign already reached its completion target.", "CAMPAIGN_FULL");
  }
  if (campaign.endDate && campaign.endDate.getTime() < Date.now()) {
    throw Errors.badRequest("This campaign's end date has passed.", "CAMPAIGN_EXPIRED");
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.ACTIVE, pausedAt: null },
  } as never);
  await activateCampaignFeed(campaign.id);
  await audit({
    userId,
    action: "CAMPAIGN.RESUMED",
    entityType: "Campaign",
    entityId: campaign.id,
    ip: opts.ip,
  });
}

export async function cancelCampaign(
  userId: string,
  campaignId: string,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  const campaign = await requireOwnedCampaign(ctx.advertiser.id, campaignId);
  if (TERMINAL.has(campaign.status)) {
    throw Errors.conflict("This campaign is already finished.", "INVALID_STATE");
  }
  if (!CANCELLABLE.has(campaign.status)) {
    throw Errors.conflict("This campaign cannot be cancelled.", "INVALID_STATE");
  }

  const refund = campaign.remainingBudget;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.campaign.updateMany({
      where: {
        id: campaign.id,
        status: { notIn: [...TERMINAL] as CampaignStatus[] },
      },
      data: { status: CampaignStatus.CANCELLED, completedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw Errors.conflict("Campaign state changed; please retry.", "CONCURRENT_UPDATE");
    }

    if (refund > 0) {
      const wallet = await tx.advertiserWallet.findUnique({
        where: { advertiserId: campaign.advertiserId },
      });
      if (!wallet) throw Errors.notFound("Advertiser wallet not found.");
      const balanceAfter = wallet.availableBalance + refund;
      await tx.advertiserWallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { increment: refund },
          totalAllocated: { decrement: refund },
        },
      });
      await tx.advertiserLedgerTransaction.create({
        data: {
          advertiserId: campaign.advertiserId,
          walletId: wallet.id,
          type: "REFUND",
          direction: "CREDIT",
          amount: refund,
          balanceAfter,
          reference: `REFUND-${campaign.id}`,
          description: `Unused campaign budget refunded · ${campaign.name}`,
          campaignId: campaign.id,
          meta: { reason: "CAMPAIGN_CANCELLED" },
        },
      });
    }

    await tx.campaign.update({
      where: { id: campaign.id },
      data: { remainingBudget: 0 },
    });

    await tx.opportunity.updateMany({
      where: { campaignId: campaign.id },
      data: { status: OpportunityStatus.PAUSED },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "CAMPAIGN.CANCELLED",
        entityType: "Campaign",
        entityId: campaign.id,
        meta: { refund },
        ipAddress: opts.ip ?? null,
      },
    });
  });

  await notifyOwner(
    campaign.advertiserId,
    NotificationType.CAMPAIGN,
    "Campaign cancelled",
    `"${campaign.name}" was cancelled${refund > 0 ? ` and ${formatMoney(refund)} was refunded` : ""}.`,
  );
}

export async function deleteDraftCampaign(
  userId: string,
  campaignId: string,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  const campaign = await requireOwnedCampaign(ctx.advertiser.id, campaignId);

  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.REJECTED) {
    throw Errors.conflict("Only draft campaigns can be deleted.", "INVALID_STATE");
  }
  if (campaign.allocatedAmount > 0) {
    throw Errors.conflict(
      "This campaign has allocated funds. Cancel it first to refund them.",
      "FUNDS_ALLOCATED",
    );
  }

  await prisma.campaign.delete({ where: { id: campaign.id } });
  await audit({
    userId,
    action: "CAMPAIGN.DELETED",
    entityType: "Campaign",
    entityId: campaign.id,
    ip: opts.ip,
  });
}

export async function listCampaigns(
  advertiserId: string,
  opts: {
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
    sort?: "newest" | "oldest" | "budget" | "spend";
  } = {},
) {
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);

  const where: {
    advertiserId: string;
    status?: string;
    OR?: Array<Record<string, unknown>>;
  } = { advertiserId };

  if (opts.status && opts.status !== "ALL") where.status = opts.status;
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: "insensitive" } },
      { description: { contains: opts.q, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, "asc" | "desc"> =
    opts.sort === "oldest"
      ? { createdAt: "asc" }
      : opts.sort === "budget"
        ? { budget: "desc" }
        : opts.sort === "spend"
          ? { spentAmount: "desc" }
          : { createdAt: "desc" };

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where: where as never,
      orderBy: orderBy as never,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { creatives: { select: { id: true, title: true, thumbnailUrl: true } } },
    }),
    prisma.campaign.count({ where: where as never }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getCampaignDetail(advertiserId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId },
    include: {
      creatives: { orderBy: { createdAt: "asc" } },
      opportunities: {
        take: 1,
        select: { id: true, status: true, currentCompletions: true, maxCompletions: true, createdAt: true },
      },
      advertiser: { select: { id: true, businessName: true, status: true } },
    },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  return campaign;
}

export async function getDashboardData(advertiserId: string) {
  const [campaigns, activeCount, wallet, recent] = await Promise.all([
    prisma.campaign.findMany({
      where: { advertiserId },
      include: { creatives: { select: { id: true } } },
    }),
    prisma.campaign.count({ where: { advertiserId, status: CampaignStatus.ACTIVE } }),
    prisma.advertiserWallet.findUnique({ where: { advertiserId } }),
    prisma.campaign.findMany({
      where: { advertiserId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, updatedAt: true, spentAmount: true, budget: true, currentCompletions: true },
    }),
  ]);

  const totals = campaigns.reduce(
    (acc, c) => {
      acc.allocated += c.allocatedAmount;
      acc.spent += c.spentAmount;
      acc.remaining += c.remainingBudget;
      acc.planned += c.budget;
      acc.completions += c.currentCompletions;
      if (lowBudgetFlag(c)) acc.lowBudget++;
      return acc;
    },
    { allocated: 0, spent: 0, remaining: 0, planned: 0, completions: 0, lowBudget: 0 },
  );

  return {
    campaignCount: campaigns.length,
    activeCount,
    totals,
    wallet: wallet ?? { availableBalance: 0, totalFunded: 0, totalAllocated: 0, totalSpent: 0 },
    recent,
  };
}

function lowBudgetFlag(campaign: {
  status: string;
  remainingBudget: number;
  budget: number;
}) {
  if (campaign.status !== CampaignStatus.ACTIVE) return false;
  if (campaign.budget <= 0) return false;
  return campaign.remainingBudget < campaign.budget * 0.2;
}

/**
 * Idempotent lifecycle sweep. Keeps campaign state and its opportunity feed
 * listing in sync:
 *  - scheduled -> active when the start date arrives;
 *  - active -> completed when the budget runs out or the target is met;
 *  - active/scheduled/paused -> expired when the end date passes;
 *  - opportunity.status is aligned with its campaign afterwards.
 */
export async function syncCampaignLifecycle(): Promise<{
  expired: number;
  completed: number;
  activated: number;
}> {
  const now = new Date();
  const expired: string[] = [];
  const completed: string[] = [];
  const activated: string[] = [];

  // Expire active/scheduled/paused campaigns whose end date has passed.
  const dueExpired = await prisma.campaign.findMany({
    where: {
      status: { in: [CampaignStatus.ACTIVE, CampaignStatus.SCHEDULED, CampaignStatus.PAUSED] },
      endDate: { lte: now },
    },
    take: 100,
  });

  for (const c of dueExpired) {
    await prisma.campaign.updateMany({
      where: { id: c.id, status: c.status },
      data: { status: CampaignStatus.EXPIRED, completedAt: c.completedAt ?? now },
    });
    await setOpportunityStatus(c.id, OpportunityStatus.EXPIRED);
    await notifyOwner(
      c.advertiserId,
      NotificationType.CAMPAIGN,
      "Campaign expired",
      `"${c.name}" ended on its schedule date.`,
    );
    await audit({
      action: "CAMPAIGN.EXPIRED",
      entityType: "Campaign",
      entityId: c.id,
      meta: { reason: "END_DATE_PASSED" },
    });
    expired.push(c.id);
  }

  // Complete active campaigns that can no longer deliver a reward.
  const activeCandidates = await prisma.campaign.findMany({
    where: { status: CampaignStatus.ACTIVE },
    take: 100,
  });

  for (const c of activeCandidates) {
    const exhausted =
      c.remainingBudget < c.rewardPerCompletion || c.currentCompletions >= c.maxCompletions;
    if (!exhausted) continue;
    await prisma.campaign.updateMany({
      where: { id: c.id, status: CampaignStatus.ACTIVE },
      data: { status: CampaignStatus.COMPLETED, completedAt: c.completedAt ?? now },
    });
    await setOpportunityStatus(c.id, OpportunityStatus.COMPLETED);
    await notifyOwner(
      c.advertiserId,
      NotificationType.CAMPAIGN_COMPLETED,
      "Campaign completed",
      `"${c.name}" has reached its budget or completion target.`,
    );
    await audit({
      action: "CAMPAIGN.COMPLETED",
      entityType: "Campaign",
      entityId: c.id,
      meta: { reason: "BUDGET_OR_TARGET_MET" },
    });
    completed.push(c.id);
  }

  // Activate scheduled/approved campaigns whose start date has arrived.
  const dueActivate = await prisma.campaign.findMany({
    where: {
      status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.APPROVED] },
      OR: [{ startDate: null }, { startDate: { lte: now } }],
    },
    take: 100,
  });

  for (const c of dueActivate) {
    await prisma.campaign.updateMany({
      where: { id: c.id, status: c.status },
      data: { status: CampaignStatus.ACTIVE, startedAt: c.startedAt ?? now },
    });
    await activateCampaignFeed(c.id);
    await audit({
      action: "CAMPAIGN.ACTIVATED",
      entityType: "Campaign",
      entityId: c.id,
      meta: { reason: "LIFECYCLE" },
    });
    activated.push(c.id);
  }

  return { expired: expired.length, completed: completed.length, activated: activated.length };
}

export { CANCELLABLE, TERMINAL };