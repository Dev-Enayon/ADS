import "server-only";

import { PaymentProviderCode, WithdrawalStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { startWithdrawalPayout, confirmPayoutSuccess } from "@/services/payouts/payouts";
import { randomUUID } from "node:crypto";

export type ListWithdrawalsInput = {
  page?: number;
  pageSize?: number;
  status?: WithdrawalStatus;
  search?: string;
};

export async function listWithdrawals(input: ListWithdrawalsInput = {}) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);

  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { reference: { contains: input.search, mode: "insensitive" as const } },
            { user: { email: { contains: input.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        processedBy: { select: { id: true, email: true } },
      },
    }),
    prisma.withdrawal.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getWithdrawalDetail(withdrawalId: string) {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: {
      user: { include: { profile: true, wallet: true } },
      processedBy: { select: { id: true, email: true } },
      ledgerEntries: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!withdrawal) throw Errors.notFound("Withdrawal not found.");
  return withdrawal;
}

/** Dispatch a PENDING withdrawal to the configured payout provider. */
export async function dispatchWithdrawal(input: {
  withdrawalId: string;
  actorId: string;
  ip?: string | null;
}) {
  return startWithdrawalPayout({
    withdrawalId: input.withdrawalId,
    actorId: input.actorId,
    ip: input.ip,
  });
}

/**
 * Operator settlement for manual payouts (default provider in production).
 * Guards state so it can never double-pay; optional explicit providerRef lets
 * an operator record the real bank reference.
 */
export async function settleWithdrawalManually(input: {
  withdrawalId: string;
  actorId: string;
  providerRef?: string;
  ip?: string | null;
}) {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: input.withdrawalId },
  });
  if (!withdrawal) throw Errors.notFound("Withdrawal not found.");
  if (
    withdrawal.status !== WithdrawalStatus.PENDING &&
    withdrawal.status !== WithdrawalStatus.PROCESSING
  ) {
    throw Errors.conflict("Withdrawal is not in a payable state.", "INVALID_STATE");
  }

  // Record an explicit reference (or a manual one if the operator gave none).
  const providerRef = input.providerRef ?? withdrawal.providerRef ?? `MANUAL-${randomUUID()}`;

  if (!withdrawal.providerRef) {
    await prisma.withdrawal.updateMany({
      where: { id: withdrawal.id, status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] } },
      data: {
        provider: PaymentProviderCode.MANUAL,
        providerRef,
        providerStatus: "manual_paid",
        processedById: input.actorId,
      },
    });
  }

  const ok = await confirmPayoutSuccess({
    withdrawalId: withdrawal.id,
    providerRef,
    providerStatus: "manual_paid",
    processedByAdmin: true,
    ip: input.ip,
  });
  if (!ok) {
    throw Errors.conflict("Withdrawal is not in a payable state.", "INVALID_STATE");
  }
  await audit({
    userId: input.actorId,
    action: "PAYOUT.ADMIN_SETTLED",
    entityType: "Withdrawal",
    entityId: withdrawal.id,
    meta: { providerRef },
    ip: input.ip,
  });
  return { withdrawalId: withdrawal.id, providerRef };
}

export async function failWithdrawalAdmin(input: {
  withdrawalId: string;
  actorId: string;
  reason: string;
  ip?: string | null;
}) {
  const { recordPayoutFailure } = await import("@/services/payouts/payouts");
  const ok = await recordPayoutFailure({
    withdrawalId: input.withdrawalId,
    failureReason: input.reason,
    providerStatus: "failed",
    ip: input.ip,
  });
  if (!ok) {
    throw Errors.conflict("Withdrawal is not in a payable state.", "INVALID_STATE");
  }
  await audit({
    userId: input.actorId,
    action: "PAYOUT.ADMIN_FAILED",
    entityType: "Withdrawal",
    entityId: input.withdrawalId,
    meta: { reason: input.reason },
    ip: input.ip,
  });
  return { withdrawalId: input.withdrawalId };
}

export async function reverseWithdrawalAdmin(input: {
  withdrawalId: string;
  actorId: string;
  reason?: string;
  ip?: string | null;
}) {
  const { reversePayout } = await import("@/services/payouts/payouts");
  const ok = await reversePayout({
    withdrawalId: input.withdrawalId,
    providerStatus: "reversed",
    reason: input.reason ?? "Reversed by an administrator.",
    ip: input.ip,
  });
  if (!ok) {
    throw Errors.conflict("Only a successful (paid) payout can be reversed.", "INVALID_STATE");
  }
  await audit({
    userId: input.actorId,
    action: "PAYOUT.ADMIN_REVERSED",
    entityType: "Withdrawal",
    entityId: input.withdrawalId,
    meta: { reason: input.reason ?? null },
    ip: input.ip,
  });
  return { withdrawalId: input.withdrawalId };
}