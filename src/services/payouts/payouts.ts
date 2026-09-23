import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  NotificationType,
  PaymentProviderCode,
  WithdrawalStatus,
} from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { configuredPayoutProvider } from "@/lib/payouts/provider";
import { prisma } from "@/lib/db";
import { publicWithdrawal } from "@/services/withdrawals";
import { refundDebitTx } from "@/services/wallet";

type Tx = Prisma.TransactionClient;

const PAYABLE_STATES = [
  WithdrawalStatus.PENDING,
  WithdrawalStatus.PROCESSING,
];

/**
 * Once a payout leaves PENDING it is never silently cancelled by the user;
 * refunds must round-trip through the provider. Only PENDING/PROCESSING may
 * be paid, only PROCESSING doubles as the "already dispatched" signal.
 */
export async function startWithdrawalPayout(input: {
  withdrawalId: string;
  actorId: string;
  ip?: string | null;
}) {
  const provider = configuredPayoutProvider();

  const { withdrawalId, actorId } = input;

  // 1) Claim the withdrawal: guard the PENDING -> PROCESSING move so two
  //    concurrent starts cannot both dispatch.
  const claimed = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: WithdrawalStatus.PENDING },
    data: {
      status: WithdrawalStatus.PROCESSING,
      processedById: actorId,
      payoutAttempts: { increment: 1 },
      provider: providerCodeForProvider(),
    },
  });
  if (claimed.count !== 1) {
    throw Errors.conflict(
      "This withdrawal is no longer awaiting payout start.",
      "INVALID_STATE",
    );
  }

  // 2) Ask the provider to dispatch (idempotent by providerRef which we own).
  let providerRef: string;
  let providerStatus: string;
  try {
    const current = await prisma.withdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
    });
    const result = await provider.startPayout({
      withdrawalId,
      reference: current.reference,
      amountKobo: current.netAmount,
      paymentMethod: current.paymentMethod,
      paymentDetails: (current.paymentDetails ?? null) as Record<string, unknown> | null,
    });
    providerRef = result.providerRef;
    providerStatus = result.providerStatus;
  } catch (err) {
    // Provider refused / failed to dispatch. Return the withdrawal to PENDING
    // so it can be retried; the attempt counter keeps a paper trail.
    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.PENDING },
    });
    throw Errors.conflict(
      err instanceof Error ? err.message : "Payout provider could not dispatch.",
      "PAYOUT_DISPATCH_FAILED",
    );
  }

  // 3) Persist the provider reference. Guarded to PROCESSING so an admin that
  //    already failed/returned it in the interim isn't overwritten.
  const stored = await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: WithdrawalStatus.PROCESSING },
    data: { providerRef, providerStatus },
  });
  if (stored.count !== 1) {
    // Rare race with an admin action; the payout is in flight but we did not
    // overwrite state. Audit it so reconciliation is possible.
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "PAYOUT.DISPATCHED_AFTER_STATE_CHANGE",
        entityType: "Withdrawal",
        entityId: withdrawalId,
        meta: { providerRef, providerStatus },
        ipAddress: input.ip ?? null,
      },
    });
  }

  const updated = await prisma.withdrawal.findUniqueOrThrow({
    where: { id: withdrawalId },
  });
  await prisma.notification.create({
    data: {
      userId: updated.userId,
      type: NotificationType.WITHDRAWAL_UPDATED,
      title: "Withdrawal processing",
      message: `Your withdrawal of ${formatMoney(updated.amount)} is being sent to your payment method.`,
    },
  });

  return publicWithdrawal(updated);
}

function providerCodeForProvider(): PaymentProviderCode {
  const raw = env.payoutProvider.toUpperCase();
  if (raw === PaymentProviderCode.DEV_MOCK) return PaymentProviderCode.DEV_MOCK;
  return PaymentProviderCode.MANUAL;
}

/**
 * Core state transitions driven by the provider (webhook) or an operator.
 * Every mutation is a guarded UPDATE so concurrent processes cannot double-pay
 * or double-refund, and every transition is journaled.
 */

export async function confirmPayoutSuccessTx(
  tx: Tx,
  input: {
    withdrawalId: string;
    providerRef?: string | null;
    providerStatus?: string;
    processedByAdmin?: boolean;
    ip?: string | null;
  },
): Promise<boolean> {
  const now = new Date();
  const changed = await tx.withdrawal.updateMany({
    where: {
      id: input.withdrawalId,
      status: { in: PAYABLE_STATES },
    },
    data: {
      status: WithdrawalStatus.SUCCESS,
      providerRef: input.providerRef ?? undefined,
      providerStatus: input.providerStatus ?? "paid",
      processedAt: now,
    },
  });
  if (changed.count !== 1) return false;

  const current = await tx.withdrawal.findUniqueOrThrow({
    where: { id: input.withdrawalId },
  });
  await tx.wallet.update({
    where: { userId: current.userId },
    data: { totalWithdrawn: { increment: current.amount } },
  });
  await tx.notification.create({
    data: {
      userId: current.userId,
      type: NotificationType.PAYOUT_SUCCEEDED,
      title: "Payout successful",
      message: `Your withdrawal of ${formatMoney(current.amount)} has been paid out.`,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: current.userId,
      action: input.processedByAdmin ? "PAYOUT.ADMIN_SUCCESS" : "PAYOUT.SUCCESS",
      entityType: "Withdrawal",
      entityId: current.id,
      meta: { amount: current.amount, reference: current.reference },
      ipAddress: input.ip ?? null,
    },
  });
  return true;
}

export async function recordPayoutFailureTx(
  tx: Tx,
  input: {
    withdrawalId: string;
    failureReason: string;
    providerStatus?: string;
    ip?: string | null;
  },
): Promise<boolean> {
  const changed = await tx.withdrawal.updateMany({
    where: { id: input.withdrawalId, status: { in: PAYABLE_STATES } },
    data: {
      status: WithdrawalStatus.FAILED,
      providerStatus: input.providerStatus ?? "failed",
      failureReason: input.failureReason,
    },
  });
  if (changed.count !== 1) return false;

  const current = await tx.withdrawal.findUniqueOrThrow({
    where: { id: input.withdrawalId },
  });
  await refundDebitTx(tx, {
    userId: current.userId,
    amount: current.amount,
    reference: `WDREF-${current.reference}`,
    description: "Withdrawal failed · funds returned",
    withdrawalId: current.id,
    ip: input.ip,
  });
  await tx.notification.create({
    data: {
      userId: current.userId,
      type: NotificationType.PAYOUT_FAILED,
      title: "Payout failed",
      message: `Your withdrawal of ${formatMoney(current.amount)} failed. Funds have been returned to your wallet.`,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: current.userId,
      action: "PAYOUT.FAILED",
      entityType: "Withdrawal",
      entityId: current.id,
      meta: { amount: current.amount, reference: current.reference, failureReason: input.failureReason },
      ipAddress: input.ip ?? null,
    },
  });
  return true;
}

/** A previously successful payout bounced back: refund AND reverse the payout totals. */
export async function reversePayoutTx(
  tx: Tx,
  input: {
    withdrawalId: string;
    providerStatus?: string;
    reason?: string;
    ip?: string | null;
  },
): Promise<boolean> {
  const changed = await tx.withdrawal.updateMany({
    where: { id: input.withdrawalId, status: WithdrawalStatus.SUCCESS },
    data: {
      status: WithdrawalStatus.REVERSED,
      providerStatus: input.providerStatus ?? "reversed",
      failureReason: input.reason ?? "Payout reversed by provider.",
    },
  });
  if (changed.count !== 1) return false;

  const current = await tx.withdrawal.findUniqueOrThrow({
    where: { id: input.withdrawalId },
  });
  await refundDebitTx(tx, {
    userId: current.userId,
    amount: current.amount,
    reference: `WDREV-${current.reference}`,
    description: "Payout reversed · funds returned",
    withdrawalId: current.id,
    ip: input.ip,
  });
  await tx.wallet.update({
    where: { userId: current.userId },
    data: { totalWithdrawn: { decrement: current.amount } },
  });
  await tx.notification.create({
    data: {
      userId: current.userId,
      type: NotificationType.PAYMENT_REFUNDED,
      title: "Payout reversed",
      message: `A payout of ${formatMoney(current.amount)} was reversed and returned to your wallet.`,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: current.userId,
      action: "PAYOUT.REVERSED",
      entityType: "Withdrawal",
      entityId: current.id,
      meta: { amount: current.amount, reference: current.reference, reason: input.reason },
      ipAddress: input.ip ?? null,
    },
  });
  return true;
}

/** idempotent production guard — convenience wrappers for admin + webhook. */
export async function confirmPayoutSuccess(input: {
  withdrawalId: string;
  providerRef?: string | null;
  providerStatus?: string;
  processedByAdmin?: boolean;
  ip?: string | null;
}): Promise<boolean> {
  return prisma.$transaction((tx) => confirmPayoutSuccessTx(tx, input));
}

export async function recordPayoutFailure(input: {
  withdrawalId: string;
  failureReason: string;
  providerStatus?: string;
  ip?: string | null;
}): Promise<boolean> {
  return prisma.$transaction((tx) => recordPayoutFailureTx(tx, input));
}

export async function reversePayout(input: {
  withdrawalId: string;
  providerStatus?: string;
  reason?: string;
  ip?: string | null;
}): Promise<boolean> {
  return prisma.$transaction((tx) => reversePayoutTx(tx, input));
}