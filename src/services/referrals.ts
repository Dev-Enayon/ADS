import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { NotificationType, ReferralStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { referralRewardAmount } from "@/lib/settings";
import { creditAvailableTx } from "@/services/wallet";

/**
 * Referral foundation (Part 1).
 *
 * Rules:
 *  - A user can only ever be referred once (ReferredUserReferral unique).
 *  - Self-referral is rejected at signup.
 *  - The referrer is rewarded when the referred user reaches their first
 *    AVAILABLE reward (single triggering event).
 *  - Rewards run through the same ledger as every other credit.
 */

export async function createReferralForNewUser(input: {
  tx: Prisma.TransactionClient;
  referredUserId: string;
  referralCode: string;
}): Promise<void> {
  const { tx, referredUserId, referralCode } = input;

  const referrer = await tx.user.findUnique({ where: { referralCode } });
  if (!referrer) {
    throw Errors.validation("That referral code is not valid.");
  }
  if (referrer.id === referredUserId) {
    throw Errors.validation("You cannot refer yourself.");
  }

  const alreadyReferred = await tx.referral.findUnique({
    where: { referredUserId },
  });
  if (alreadyReferred) {
    throw Errors.conflict("This account is already linked to a referral.", "ALREADY_REFERRED");
  }

  await tx.referral.create({
    data: {
      referrerId: referrer.id,
      referredUserId,
      status: ReferralStatus.PENDING,
    },
  });
  await tx.user.update({
    where: { id: referredUserId },
    data: { referredById: referrer.id },
  });
}

type MaybeTransaction = Prisma.TransactionClient;

/**
 * Triggered after a referred user's reward becomes AVAILABLE. Idempotent:
 * the PENDING -> COMPLETED transition on the Referral row can only happen once.
 */
export async function maybeCreditReferrer(
  referredUserId: string,
  client: MaybeTransaction = prisma,
): Promise<boolean> {
  const referral = await client.referral.findUnique({
    where: { referredUserId },
    include: { referredUser: { select: { email: true } } },
  });
  if (!referral || referral.status !== ReferralStatus.PENDING) return false;
  // Defensive: never reward a pathological self-loop.
  if (referral.referrerId === referredUserId) return false;

  const availableRewards = await client.reward.count({
    where: { userId: referredUserId, status: "AVAILABLE" },
  });
  if (availableRewards < 1) return false;

  const amount = await referralRewardAmount();

  await client.$transaction(async (tx) => {
    const claimed = await tx.referral.updateMany({
      where: { id: referral.id, status: ReferralStatus.PENDING },
      data: {
        status: ReferralStatus.COMPLETED,
        amount,
        rewardedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return; // concurrent processing already finished

    if (amount > 0) {
      await creditAvailableTx(tx, {
        userId: referral.referrerId,
        type: "REFERRAL_REWARD",
        amount,
        description: "Referral reward · referred a new user",
        meta: { referredUserId },
      });
      await tx.notification.create({
        data: {
          userId: referral.referrerId,
          type: NotificationType.REFERRAL,
          title: "Referral reward",
          message: `You earned ${formatMoney(amount)} because your referral ${maskEmail(referral.referredUser.email)} completed a rewarded activity.`,
        },
      });
    }
    await tx.notification.create({
      data: {
        userId: referredUserId,
        type: NotificationType.REFERRAL,
        title: "Welcome bonus unlocked",
        message:
          amount > 0
            ? `Your referrer earned ${formatMoney(amount)} when you received your first reward.`
            : "Your referral was recorded.",
      },
    });
    await tx.auditLog.create({
      data: {
        userId: referral.referrerId,
        action: "REFERRAL.REWARDED",
        entityType: "Referral",
        entityId: referral.id,
        meta: { amount, referredUserId },
      },
    });
  });

  return true;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  const tail = local.slice(-2);
  const masked = local.length <= 4 ? `${head}••` : `${head}•••${tail}`;
  return `${masked}@${domain}`;
}

export async function cancelPendingReferral(referredUserId: string): Promise<void> {
  await prisma.referral.updateMany({
    where: { referredUserId, status: ReferralStatus.PENDING },
    data: { status: ReferralStatus.REJECTED },
  });
}

export async function getReferralSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  const [invites, ledgerSum] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { referredUser: { select: { email: true, status: true } } },
    }),
    prisma.ledgerTransaction.aggregate({
      where: { userId, type: "REFERRAL_REWARD" },
      _sum: { amount: true },
    }),
  ]);

  return {
    referralCode: user?.referralCode ?? null,
    totalInvites: invites.length,
    completedInvites: invites.filter((r) => r.status === ReferralStatus.COMPLETED).length,
    pendingInvites: invites.filter((r) => r.status === ReferralStatus.PENDING).length,
    totalRewarded: ledgerSum._sum.amount ?? 0,
    invites: invites.map((r) => ({
      id: r.id,
      email: maskEmail(r.referredUser.email),
      status: r.status,
      amount: r.amount,
      rewardedAt: r.rewardedAt,
      createdAt: r.createdAt,
    })),
  };
}