import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  NotificationType,
  PaymentMethod,
  RiskEventType,
  UserStatus,
  WithdrawalStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  maxWithdrawalsPerHour,
  withdrawalRules,
  withdrawalsEnabled,
} from "@/lib/settings";
import { debitAvailableTx, refundDebitTx } from "@/services/wallet";
import { recordRiskEvent } from "@/services/risk";
import { randomUUID } from "node:crypto";

export type CreateWithdrawalInput = {
  userId: string;
  amount: number; // kobo
  paymentMethod: PaymentMethod;
  paymentDetails: Prisma.InputJsonObject;
  idempotencyKey?: string | null;
  ip?: string | null;
};

export async function assertCanWithdraw(user: {
  status: string;
  emailVerifiedAt: Date | null;
}): Promise<void> {
  if (user.status === UserStatus.SUSPENDED) throw Errors.suspended();
  if (!user.emailVerifiedAt || user.status !== UserStatus.ACTIVE) {
    throw Errors.forbidden("Your email must be verified to request withdrawals.");
  }
}

export async function createWithdrawal(input: CreateWithdrawalInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { wallet: true },
  });
  if (!user) throw Errors.unauthorized();
  await assertCanWithdraw(user);

  // Master switch: operators disable payouts instantly (e.g. provider outage).
  if (!(await withdrawalsEnabled())) {
    throw Errors.conflict(
      "Withdrawals are currently disabled. Please try again later.",
      "WITHDRAWALS_DISABLED",
    );
  }

  const rules = await withdrawalRules();

  if (input.amount < rules.minimum) {
    throw Errors.badRequest(
      `Minimum withdrawal is ${formatMoney(rules.minimum)}.`,
      "BELOW_MINIMUM",
    );
  }
  if (rules.maximum > 0 && input.amount > rules.maximum) {
    throw Errors.badRequest(
      `Maximum withdrawal per request is ${formatMoney(rules.maximum)}.`,
      "ABOVE_MAXIMUM",
    );
  }

  // Duplicate-request protection: reuse an existing result for the same key.
  if (input.idempotencyKey) {
    const existing = await prisma.withdrawal.findFirst({
      where: { userId: input.userId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return publicWithdrawal(existing);
    }
  }

  // Single in-flight withdrawal at a time keeps funds unambiguous.
  const inFlight = await prisma.withdrawal.findFirst({
    where: {
      userId: input.userId,
      status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
    },
  });
  if (inFlight) {
    throw Errors.conflict(
      "You already have a withdrawal being processed. Complete or cancel it first.",
      "WITHDRAWAL_IN_FLIGHT",
    );
  }

  const fee = Math.floor((input.amount * rules.feeRate) / 100);
  const netAmount = input.amount - fee;

  if (rules.dailyLimit > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = await prisma.withdrawal.aggregate({
      where: {
        userId: input.userId,
        createdAt: { gte: startOfDay },
        status: {
          in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING, WithdrawalStatus.SUCCESS],
        },
      },
      _sum: { amount: true },
    });
    if ((today._sum.amount ?? 0) + input.amount > rules.dailyLimit) {
      throw Errors.badRequest(
        `You have reached your daily withdrawal limit of ${formatMoney(rules.dailyLimit)}.`,
        "DAILY_LIMIT_REACHED",
      );
    }
  }

  const reference = `WD-${randomUUID().slice(0, 12).toUpperCase()}`;

  // Fraud signal (non-blocking): repeated withdrawal requests over the per-hour
  // cap. The single in-flight guard already blocks concurrent abuse; this
  // surfaces a pattern to admins.
  try {
    const [recentInHour, perHourLimit] = await Promise.all([
      prisma.withdrawal.count({
        where: { userId: input.userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      }),
      maxWithdrawalsPerHour(),
    ]);
    if (perHourLimit > 0 && recentInHour + 1 > perHourLimit) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.WITHDRAWAL_ABUSE,
        severity: "HIGH",
        description: "Withdrawal requests above the per-hour threshold.",
        entityType: "Withdrawal",
        meta: { recentInHour, perHourLimit },
        ipAddress: input.ip ?? null,
      });
    }
  } catch {
    // best-effort
  }

  const withdrawal = await prisma.$transaction(async (tx) => {
    await debitAvailableTx(tx, {
      userId: input.userId,
      type: "WITHDRAWAL",
      amount: input.amount,
      description: `Withdrawal request · ${formatMoney(input.amount)}`,
      reference,
      withdrawalId: null,
      meta: { paymentMethod: input.paymentMethod, netAmount },
    });

    const created = await tx.withdrawal.create({
      data: {
        userId: input.userId,
        amount: input.amount,
        fee,
        netAmount,
        status: WithdrawalStatus.PENDING,
        reference,
        paymentMethod: input.paymentMethod,
        paymentDetails: input.paymentDetails,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        type: NotificationType.WITHDRAWAL_CREATED,
        title: "Withdrawal requested",
        message: `Your withdrawal of ${formatMoney(input.amount)} is pending review. Reference ${reference}.`,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: input.userId,
        action: "WITHDRAWAL.CREATED",
        entityType: "Withdrawal",
        entityId: created.id,
        meta: { amount: input.amount, fee, netAmount, reference },
        ipAddress: input.ip ?? null,
      },
    });

    return created;
  });

  return publicWithdrawal(withdrawal);
}

/**
 * Status transitions (server-side only; no provider calls in Part 1).
 *
 * Part 3 wires the real payout provider here. Until then:
 *  - PENDING -> CANCELLED  (user cancels an unprocessed request)
 *  - PENDING/PROCESSING -> FAILED (refund) — reserved for provider errors
 *  - PENDING/PROCESSING -> SUCCESS only when a provider confirms funds moved.
 */
export async function transitionWithdrawal(input: {
  withdrawalId: string;
  to: WithdrawalStatus;
  failureReason?: string | null;
  ip?: string | null;
}) {
  const { withdrawalId, to, failureReason } = input;

  if (to === WithdrawalStatus.SUCCESS) {
    return confirmWithdrawalSuccess(withdrawalId, input.ip);
  }

  if (to === WithdrawalStatus.CANCELLED || to === WithdrawalStatus.FAILED) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
      if (!current) throw Errors.notFound("Withdrawal not found.");
      if (
        current.status !== WithdrawalStatus.PENDING &&
        current.status !== WithdrawalStatus.PROCESSING
      ) {
        throw Errors.conflict(
          "Withdrawal is not in a cancellable state.",
          "INVALID_STATE",
        );
      }
      const changed = await tx.withdrawal.updateMany({
        where: { id: withdrawalId },
        data: { status: to, failureReason: failureReason ?? null },
      });
      if (changed.count !== 1) {
        throw Errors.conflict("Withdrawal state changed; please retry.", "CONCURRENT_UPDATE");
      }

      await refundDebitTx(tx, {
        userId: current.userId,
        amount: current.amount,
        reference: `WDREF-${current.reference}`,
        description:
          to === WithdrawalStatus.CANCELLED
            ? "Withdrawal cancelled · funds returned"
            : "Withdrawal failed · funds returned",
        withdrawalId: current.id,
        ip: input.ip,
      });

      await tx.notification.create({
        data: {
          userId: current.userId,
          type: NotificationType.WITHDRAWAL_UPDATED,
          title: to === WithdrawalStatus.CANCELLED ? "Withdrawal cancelled" : "Withdrawal failed",
          message:
            to === WithdrawalStatus.CANCELLED
              ? `Your withdrawal of ${formatMoney(current.amount)} was cancelled. Funds have been returned to your wallet.`
              : `Your withdrawal of ${formatMoney(current.amount)} failed. Funds have been returned to your wallet.`,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: current.userId,
          action: `WITHDRAWAL.${to === WithdrawalStatus.CANCELLED ? "CANCELLED" : "FAILED"}`,
          entityType: "Withdrawal",
          entityId: current.id,
          meta: { amount: current.amount, reference: current.reference, failureReason },
          ipAddress: input.ip ?? null,
        },
      });
      return publicWithdrawal({
        ...current,
        status: to,
        failureReason: failureReason ?? null,
      });
    });
  }

  if (to === WithdrawalStatus.PROCESSING) {
    const changed = await prisma.withdrawal.updateMany({
      where: { id: withdrawalId, status: WithdrawalStatus.PENDING },
      data: { status: WithdrawalStatus.PROCESSING },
    });
    if (changed.count !== 1) {
      throw Errors.conflict("Withdrawal is not pending.", "INVALID_STATE");
    }
    const updated = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!updated) throw Errors.notFound("Withdrawal not found.");
    return publicWithdrawal(updated);
  }

  throw Errors.badRequest("Unsupported withdrawal transition.", "INVALID_TRANSITION");
}

/** Reserved for Part 3 payout-provider confirmation. Not exposed via any API. */
async function confirmWithdrawalSuccess(withdrawalId: string, ip?: string | null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!current) throw Errors.notFound("Withdrawal not found.");
    if (current.status !== WithdrawalStatus.PROCESSING && current.status !== WithdrawalStatus.PENDING) {
      throw Errors.conflict("Withdrawal is not in a payable state.", "INVALID_STATE");
    }
    await tx.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.SUCCESS, processedAt: new Date() },
    });
    await tx.wallet.update({
      where: { userId: current.userId },
      data: { totalWithdrawn: { increment: current.amount } },
    });
    await tx.notification.create({
      data: {
        userId: current.userId,
        type: NotificationType.WITHDRAWAL_UPDATED,
        title: "Withdrawal successful",
        message: `Your withdrawal of ${formatMoney(current.amount)} was successful.`,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: current.userId,
        action: "WITHDRAWAL.SUCCESS",
        entityType: "Withdrawal",
        entityId: current.id,
        meta: { amount: current.amount, reference: current.reference },
        ipAddress: ip ?? null,
      },
    });
    return publicWithdrawal({ ...current, status: WithdrawalStatus.SUCCESS });
  });
}

/** A client can only ever cancel their own PENDING withdrawal. */
export async function cancelWithdrawal(userId: string, withdrawalId: string) {
  const withdrawal = await prisma.withdrawal.findFirst({
    where: { id: withdrawalId, userId },
  });
  if (!withdrawal) throw Errors.notFound("Withdrawal not found.");
  return transitionWithdrawal({
    withdrawalId: withdrawal.id,
    to: WithdrawalStatus.CANCELLED,
  });
}

export async function listWithdrawals(userId: string) {
  const rows = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(publicWithdrawal);
}

export function publicWithdrawal(w: {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: WithdrawalStatus;
  reference: string;
  paymentMethod: PaymentMethod;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    amount: w.amount,
    fee: w.fee,
    netAmount: w.netAmount,
    status: w.status,
    reference: w.reference,
    paymentMethod: w.paymentMethod,
    failureReason: w.failureReason,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}