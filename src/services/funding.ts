import "server-only";

import { FundingStatus, NotificationType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import {
  requireAdvertiserContext,
  assertRole,
  assertAdvertiserActive,
} from "@/lib/auth/advertiser";
import {
  getPaymentProvider,
  parseProviderCode,
} from "@/lib/payments/provider";
import { randomUUID } from "node:crypto";

export type FundCampaignInput = {
  campaignId?: string;
  amount: number; // kobo
  idempotencyKey?: string;
};

async function requireOwnedCampaign(advertiserId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  return campaign;
}

/**
 * Creates a funding intent and hands off to the payment provider.
 * Money movement NEVER happens here -- it happens only after
 * verifyFunding() reports success.
 */
export async function initializeFunding(
  userId: string,
  input: FundCampaignInput,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  assertAdvertiserActive(ctx);

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw Errors.validation("Funding amount must be a positive whole number of kobo.");
  }

  if (input.campaignId) {
    await requireOwnedCampaign(ctx.advertiser.id, input.campaignId);
  }

  if (input.idempotencyKey) {
    const existing = await prisma.campaignFunding.findFirst({
      where: { advertiserId: ctx.advertiser.id, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.amount !== input.amount) {
        throw Errors.conflict(
          "This idempotency key was already used for a different amount.",
          "IDEMPOTENCY_KEY_MISMATCH",
        );
      }
      return existing;
    }
  }

  const providerCode = parseProviderCode(process.env.PAYMENT_PROVIDER);
  const provider = getPaymentProvider(providerCode);
  const reference = `FD-${randomUUID()}`;

  const funding = await prisma.campaignFunding.create({
    data: {
      advertiserId: ctx.advertiser.id,
      campaignId: input.campaignId ?? null,
      amount: input.amount,
      status: FundingStatus.INITIALIZED,
      provider: providerCode,
      reference,
      idempotencyKey: input.idempotencyKey ?? null,
      meta: { source: "advertiser_portal" },
    },
  });

  const init = await provider.initializePayment({
    reference,
    amountKobo: input.amount,
    meta: { advertiserId: ctx.advertiser.id },
  });

  const updated = await prisma.campaignFunding.update({
    where: { id: funding.id },
    data: {
      providerRef: init.providerRef,
      status: FundingStatus.PENDING_VERIFICATION,
      meta: { ...(funding.meta as object), providerRef: init.providerRef, checkoutUrl: init.checkoutUrl },
    },
  });

  await audit({
    userId,
    action: "FUNDING.INITIALIZED",
    entityType: "CampaignFunding",
    entityId: funding.id,
    meta: { amount: input.amount, provider: providerCode, providerRef: init.providerRef },
    ip: opts.ip,
  });

  return updated;
}

export type VerifyFundingResult = {
  id: string;
  status: FundingStatus;
  credited: boolean;
  amount: number;
};

/**
 * Verifies a funding intent with the provider and, on success, credits the
 * advertiser wallet atomically. Idempotent: a funding record is claimed from
 * PENDING_VERIFICATION -> COMPLETED exactly once (concurrent-safe).
 */
export async function verifyFunding(
  userId: string,
  fundingId: string,
  opts: { ip?: string | null } = {},
): Promise<VerifyFundingResult> {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);

  const funding = await prisma.campaignFunding.findFirst({
    where: { id: fundingId, advertiserId: ctx.advertiser.id },
  });
  if (!funding) throw Errors.notFound("Funding record not found.");
  if (funding.status !== FundingStatus.PENDING_VERIFICATION) {
    throw Errors.conflict(
      funding.status === FundingStatus.COMPLETED
        ? "This payment was already completed."
        : "This payment cannot be verified in its current state.",
      "INVALID_STATE",
    );
  }

  const provider = getPaymentProvider(funding.provider);
  const verification = await provider.verifyPayment({
    providerRef: funding.providerRef ?? funding.reference,
    expectedAmountKobo: funding.amount,
  });

  if (verification.status !== "success") {
    const reason = verification.failureReason ?? "Payment could not be verified.";
    const failed = await prisma.campaignFunding.update({
      where: { id: funding.id },
      data:
        verification.status === "reversed"
          ? { status: FundingStatus.REVERSED, failureReason: reason }
          : { status: FundingStatus.FAILED, failureReason: reason },
    });
    await audit({
      userId,
      action: "FUNDING.VERIFY_FAILED",
      entityType: "CampaignFunding",
      entityId: funding.id,
      meta: { status: verification.status, reason },
      ip: opts.ip,
    });
    return { id: funding.id, status: failed.status, credited: false, amount: funding.amount };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Atomic claim -- prevents double-credit under concurrency.
    const claimed = await tx.campaignFunding.updateMany({
      where: { id: funding.id, status: FundingStatus.PENDING_VERIFICATION },
      data: { status: FundingStatus.COMPLETED, verifiedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw Errors.conflict("This payment was already processed.", "ALREADY_PROCESSED");
    }

    const wallet = await tx.advertiserWallet.findUnique({
      where: { advertiserId: ctx.advertiser.id },
    });
    if (!wallet) throw Errors.notFound("Advertiser wallet not found.");

    const balanceAfter = wallet.availableBalance + funding.amount;
    await tx.advertiserWallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { increment: funding.amount },
        totalFunded: { increment: funding.amount },
      },
    });
    await tx.advertiserLedgerTransaction.create({
      data: {
        advertiserId: ctx.advertiser.id,
        walletId: wallet.id,
        type: "FUNDING_CREDIT",
        direction: "CREDIT",
        amount: funding.amount,
        balanceAfter,
        reference: `FD-CR-${funding.id}`,
        description: `Wallet funding · ${formatMoney(funding.amount)} (${provider.name})`,
        fundingId: funding.id,
        meta: { fundingReference: funding.reference, provider: provider.name },
      },
    });

    await tx.notification.create({
      data: {
        userId: ctx.advertiser.userId,
        type: NotificationType.PAYMENT_SUCCESS,
        title: "Payment received",
        message: `${formatMoney(funding.amount)} was added to your advertiser wallet.`,
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "FUNDING.VERIFIED",
        entityType: "CampaignFunding",
        entityId: funding.id,
        meta: { amount: funding.amount, providerRef: funding.providerRef },
        ipAddress: opts.ip ?? null,
      },
    });

    return { creditAmount: funding.amount, status: FundingStatus.COMPLETED };
  });

  return {
    id: funding.id,
    status: result.status,
    credited: result.creditAmount > 0,
    amount: funding.amount,
  };
}

/**
 * Atomic transfer from the advertiser wallet into a campaign. Used at
 * submission time to reserve the planned budget and on manual "fund this
 * campaign" actions. Both the wallet debit and campaign counters are guarded
 * by conditional writes so concurrent submissions cannot overspend.
 */
export async function allocateToCampaign(
  userId: string,
  campaignId: string,
  amountKobo: number,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);
  assertAdvertiserActive(ctx);

  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw Errors.validation("Allocation must be a positive whole number of kobo.");
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId: ctx.advertiser.id },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  if (campaign.status !== "DRAFT" && campaign.status !== "REJECTED") {
    throw Errors.conflict("Campaign funds can only be adjusted before submission.", "INVALID_STATE");
  }

  const stillNeeded = campaign.budget - campaign.allocatedAmount;
  if (amountKobo > stillNeeded) {
    throw Errors.badRequest(
      "Allocation exceeds the campaign's remaining planned budget.",
      "OVER_ALLOCATION",
    );
  }

  const wallet = await prisma.advertiserWallet.findUnique({
    where: { advertiserId: ctx.advertiser.id },
  });
  if (!wallet || wallet.availableBalance < amountKobo) {
    throw Errors.insufficientFunds("Your advertiser wallet does not have enough funds. Add funds first.");
  }

  await prisma.$transaction(async (tx) => {
    const debit = await tx.advertiserWallet.updateMany({
      where: { id: wallet.id, availableBalance: { gte: amountKobo } },
      data: {
        availableBalance: { decrement: amountKobo },
        totalAllocated: { increment: amountKobo },
      },
    });
    if (debit.count !== 1) {
      throw Errors.insufficientFunds("Your advertiser wallet does not have enough funds.");
    }

    await tx.campaign.updateMany({
      where: { id: campaignId, advertiserId: ctx.advertiser.id },
      data: {
        allocatedAmount: { increment: amountKobo },
        remainingBudget: { increment: amountKobo },
      },
    });

    await tx.advertiserLedgerTransaction.create({
      data: {
        advertiserId: ctx.advertiser.id,
        walletId: wallet.id,
        type: "CAMPAIGN_ALLOCATION",
        direction: "DEBIT",
        amount: amountKobo,
        balanceAfter: wallet.availableBalance - amountKobo,
        reference: `ALLOC-${randomUUID()}`,
        description: `Funds reserved for campaign "${campaign.name}"`,
        campaignId: campaign.id,
        meta: { amount: amountKobo },
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "FUNDING.ALLOCATED",
        entityType: "Campaign",
        entityId: campaign.id,
        meta: { amount: amountKobo },
        ipAddress: opts.ip ?? null,
      },
    });
  });

  const updated = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId: ctx.advertiser.id },
    select: { allocatedAmount: true, remainingBudget: true, budget: true },
  });
  return { campaign: updated, walletBalanceAfter: wallet.availableBalance - amountKobo };
}

export async function getBillingSummary(advertiserId: string) {
  const [wallet, campaignTotals, recentFunding] = await Promise.all([
    prisma.advertiserWallet.findUnique({ where: { advertiserId } }),
    prisma.campaign.aggregate({
      where: { advertiserId },
      _sum: { budget: true, allocatedAmount: true, remainingBudget: true, spentAmount: true },
      _count: true,
    }),
    prisma.campaignFunding.findMany({
      where: { advertiserId },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return {
    wallet: wallet ?? { availableBalance: 0, totalFunded: 0, totalAllocated: 0, totalSpent: 0 },
    campaigns: {
      count: campaignTotals._count,
      totalPlannedBudget: campaignTotals._sum.budget ?? 0,
      totalAllocated: campaignTotals._sum.allocatedAmount ?? 0,
      totalRemaining: campaignTotals._sum.remainingBudget ?? 0,
      totalSpent: campaignTotals._sum.spentAmount ?? 0,
    },
    recentFunding,
  };
}

export async function listFunding(
  advertiserId: string,
  opts: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max((opts.page ?? 1), 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 15, 1), 100);
  const [rows, total] = await Promise.all([
    prisma.campaignFunding.findMany({
      where: { advertiserId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { campaign: { select: { id: true, name: true } } },
    }),
    prisma.campaignFunding.count({ where: { advertiserId } }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}