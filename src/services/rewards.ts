import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { NotificationType, RewardStatus, WatchSessionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { rewardValidationDelaySeconds } from "@/lib/settings";
import {
  creditPendingTx,
  debitAvailableTx,
  releasePendingToAvailableTx,
  type PrismaOrTx,
} from "@/services/wallet";
import { randomUUID } from "node:crypto";
import { maybeCreditReferrer } from "@/services/referrals";

const OPEN_SESSION_STATUSES: WatchSessionStatus[] = [
  WatchSessionStatus.STARTED,
  WatchSessionStatus.IN_PROGRESS,
];

export type CompleteWatchTxInput = {
  tx: PrismaOrTx;
  userId: string;
  watchSessionId: string;
  opportunityId: string;
  rewardAmount: number;
  opportunityTitle: string;
  requiredDuration: number;
  ip?: string | null;
  /** Advertiser campaign id when the opportunity belongs to a campaign. */
  campaignId?: string | null;
  /** Owner advertiser id for wallet spend tracking. */
  advertiserId?: string | null;
};

/**
 * Grants a PENDING reward for a completed watch session.
 *
 * Idempotency is guaranteed at the database level:
 *  - opportunity capacity increments atomically (never exceeds maxCompletions);
 *  - the watch session can only transition STARTED/IN_PROGRESS -> COMPLETED once;
 *  - Reward.watchSessionId is unique, so a second attempt cannot insert another reward.
 */
export async function completeWatchSessionTx(
  input: CompleteWatchTxInput,
): Promise<{
  id: string;
  amount: number;
  status: RewardStatus;
}> {
  return input.tx.$transaction(async (tx) => {
    // Atomic capacity guard: increments currentCompletions only while under max.
    const capacityGranted: number = await tx.$executeRaw`
      UPDATE "Opportunity"
      SET "currentCompletions" = "currentCompletions" + 1
      WHERE "id" = ${input.opportunityId}
        AND ("maxCompletions" IS NULL OR "currentCompletions" < "maxCompletions")
    `;
    if (capacityGranted !== 1) {
      throw Errors.conflict(
        "This opportunity has reached its completion limit.",
        "OPPORTUNITY_FULL",
      );
    }

    const reward = await createRewardAndCreditTx({
      tx,
      userId: input.userId,
      watchSessionId: input.watchSessionId,
      opportunityId: input.opportunityId,
      rewardAmount: input.rewardAmount,
      opportunityTitle: input.opportunityTitle,
      requiredDuration: input.requiredDuration,
      ip: input.ip,
    });

    // Advertiser campaign economics: atomically move budget from the campaign
    // to the reward. The conditional guard (status ACTIVE + remaining budget +
    // capacity) makes concurrent completions safe -- if the campaign ran dry
    // or completed the instant before, this whole transaction rolls back,
    // including the opportunity capacity increment above.
    if (input.campaignId) {
      const campaignSpent = await tx.$executeRaw`
        UPDATE "Campaign"
        SET "currentCompletions" = "currentCompletions" + 1,
            "completedViews" = "completedViews" + 1,
            "spentAmount" = "spentAmount" + ${input.rewardAmount},
            "remainingBudget" = "remainingBudget" - ${input.rewardAmount}
        WHERE "id" = ${input.campaignId}
          AND "status" = 'ACTIVE'
          AND "remainingBudget" >= ${input.rewardAmount}
          AND "currentCompletions" < "maxCompletions"
      `;
      if (campaignSpent !== 1) {
        throw Errors.conflict(
          "This campaign's budget or completion target has been reached.",
          "CAMPAIGN_UNAVAILABLE",
        );
      }
      if (input.advertiserId) {
        await tx.advertiserWallet.updateMany({
          where: { advertiserId: input.advertiserId },
          data: { totalSpent: { increment: input.rewardAmount } },
        });
      }
    }

    return { id: reward.id, amount: reward.amount, status: reward.status };
  });
}

async function createRewardAndCreditTx(opts: {
  tx: Prisma.TransactionClient;
  userId: string;
  watchSessionId: string;
  opportunityId: string;
  rewardAmount: number;
  opportunityTitle: string;
  requiredDuration: number;
  ip?: string | null;
}) {
  const { tx } = opts;

  const claimed = await tx.watchSession.updateMany({
    where: {
      id: opts.watchSessionId,
      userId: opts.userId,
      status: { in: OPEN_SESSION_STATUSES },
    },
    data: {
      status: WatchSessionStatus.COMPLETED,
      completedAt: new Date(),
      watchedDuration: opts.requiredDuration,
    },
  });
  if (claimed.count !== 1) {
    throw Errors.conflict(
      "This watch session was already completed or is no longer active.",
      "SESSION_COMPLETED",
    );
  }

  const reward = await tx.reward.create({
    data: {
      userId: opts.userId,
      opportunityId: opts.opportunityId,
      watchSessionId: opts.watchSessionId,
      amount: opts.rewardAmount,
      status: RewardStatus.PENDING,
      reason: `Completed sponsored video: ${opts.opportunityTitle}`,
    },
  });

  await creditPendingTx(tx, {
    userId: opts.userId,
    type: "REWARD",
    amount: opts.rewardAmount,
    description: `Video reward · ${opts.opportunityTitle}`,
    reference: randomUUID(),
    opportunityId: opts.opportunityId,
    rewardId: reward.id,
    meta: { watchSessionId: opts.watchSessionId },
  });

  await tx.notification.create({
    data: {
      userId: opts.userId,
      type: NotificationType.REWARD_RECEIVED,
      title: "Reward earned",
      message: `You earned ${formatMoney(opts.rewardAmount)} for watching "${opts.opportunityTitle}".`,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: opts.userId,
      action: "REWARD.CREATED",
      entityType: "Reward",
      entityId: reward.id,
      meta: { amount: opts.rewardAmount, opportunityId: opts.opportunityId },
      ipAddress: opts.ip ?? null,
    },
  });

  return reward;
}

/**
 * Publish all PENDING rewards that have passed the validation delay.
 * Called on balance/dashboard reads and opportunistically after completion.
 */
export async function releaseEligiblePendingRewards(): Promise<number> {
  const delaySeconds = await rewardValidationDelaySeconds();
  if (delaySeconds < 0) return 0;
  const cutoff = new Date(Date.now() - delaySeconds * 1000);

  const pending = await prisma.reward.findMany({
    where: { status: RewardStatus.PENDING, createdAt: { lte: cutoff } },
    take: 100,
  });

  let released = 0;
  for (const reward of pending) {
    try {
      const result = await markRewardAvailable(reward.id);
      if (result) released++;
    } catch (error) {
      console.error(`[rewards] release failed for reward ${reward.id}`, error);
    }
  }
  return released;
}

/**
 * Move a single PENDING reward to AVAILABLE. Idempotent: returns null if the
 * reward was already processed or is not in PENDING state.
 */
export async function markRewardAvailable(
  rewardId: string,
  opts: { ip?: string | null } = {},
): Promise<{ id: string; amount: number } | null> {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findUnique({ where: { id: rewardId } });
    if (!reward || reward.status !== RewardStatus.PENDING) return null;

    const claimed = await tx.reward.updateMany({
      where: { id: rewardId, status: RewardStatus.PENDING },
      data: { status: RewardStatus.AVAILABLE, releasedAt: new Date() },
    });
    if (claimed.count !== 1) return null;

    await releasePendingToAvailableTx(
      tx,
      reward.userId,
      reward.amount,
      `RELEASE-${rewardId}`,
      opts.ip,
    );

    await tx.notification.create({
      data: {
        userId: reward.userId,
        type: NotificationType.REWARD_RECEIVED,
        title: "Reward available",
        message: `${formatMoney(reward.amount)} is now available in your wallet.`,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: reward.userId,
        action: "REWARD.RELEASED",
        entityType: "Reward",
        entityId: reward.id,
        meta: { amount: reward.amount },
        ipAddress: opts.ip ?? null,
      },
    });

    return { id: reward.id, amount: reward.amount };
  }).then(async (result) => {
    if (result) {
      // Referrer reward triggers when the referred user receives earnings.
      const reward = await prisma.reward.findUnique({
        where: { id: rewardId },
        select: { userId: true },
      });
      if (reward) await maybeCreditReferrer(reward.userId).catch(() => undefined);
    }
    return result;
  });
}

/**
 * Reverse a reward that failed validation/risk checks (Part 3 integration
 * point). Funds are pulled back out of the balances and a REVERSAL ledger row
 * records the change.
 */
export async function reverseReward(
  rewardId: string,
  reason: string,
  opts: { ip?: string | null } = {},
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findUnique({ where: { id: rewardId } });
    if (!reward) throw Errors.notFound("Reward not found.");
    if (reward.status === RewardStatus.REVERSED || reward.status === RewardStatus.CANCELLED) {
      throw Errors.conflict("Reward was already reversed or cancelled.", "ALREADY_PROCESSED");
    }

    if (reward.status === RewardStatus.AVAILABLE) {
      const claimed = await tx.reward.updateMany({
        where: { id: rewardId, status: RewardStatus.AVAILABLE },
        data: { status: RewardStatus.REVERSED },
      });
      if (claimed.count !== 1) {
        throw Errors.conflict("Reward state changed; please retry.", "CONCURRENT_UPDATE");
      }
      await debitAvailableTx(tx, {
        userId: reward.userId,
        type: "REVERSAL",
        amount: reward.amount,
        description: `Reward reversed · ${reason}`,
        reference: `REV-${rewardId}`,
        rewardId: reward.id,
        meta: { reason },
      });
    } else if (reward.status === RewardStatus.PENDING) {
      const claimed = await tx.reward.updateMany({
        where: { id: rewardId, status: RewardStatus.PENDING },
        data: { status: RewardStatus.REVERSED },
      });
      if (claimed.count !== 1) {
        throw Errors.conflict("Reward state changed; please retry.", "CONCURRENT_UPDATE");
      }
      // Remove the pending credit that was never released.
      const wallet = await tx.wallet.findUnique({ where: { userId: reward.userId } });
      if (!wallet) throw Errors.notFound("Wallet not found.");
      if (wallet.pendingBalance < reward.amount) {
        throw Errors.conflict("Pending balance cannot cover reversal.", "BALANCE_MISMATCH");
      }
      await tx.ledgerTransaction.create({
        data: {
          userId: reward.userId,
          walletId: wallet.id,
          type: "REVERSAL",
          direction: "DEBIT",
          amount: reward.amount,
          balanceAfter: wallet.pendingBalance - reward.amount,
          reference: `REV-${rewardId}`,
          description: `Pending reward reversed · ${reason}`,
          rewardId: reward.id,
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { pendingBalance: { decrement: reward.amount } },
      });
    } else {
      throw Errors.conflict("Reward not in a reversible state.", "INVALID_STATE");
    }

    await tx.auditLog.create({
      data: {
        userId: reward.userId,
        action: "REWARD.REVERSED",
        entityType: "Reward",
        entityId: reward.id,
        meta: { amount: reward.amount, reason },
        ipAddress: opts.ip ?? null,
      },
    });
    return { id: reward.id };
  });
}

export async function listRewards(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  return prisma.reward.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: { opportunity: { select: { title: true, type: true } } },
  });
}