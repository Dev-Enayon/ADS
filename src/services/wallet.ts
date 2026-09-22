import "server-only";

import type { Prisma, PrismaClient, Wallet } from "@/generated/prisma/client";
import type { LedgerType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { randomUUID } from "node:crypto";

type Tx = Prisma.TransactionClient;
export type PrismaOrTx = PrismaClient | Tx;

export type CreditInput = {
  userId: string;
  type: LedgerType;
  amount: number; // kobo, absolute
  description: string;
  reference?: string;
  meta?: Prisma.InputJsonObject;
  opportunityId?: string | null;
  rewardId?: string | null;
  withdrawalId?: string | null;
};

/**
 * Core ledger helpers. Each one MUST run inside a transaction so that the
 * balance mutation and the ledger row are written atomically.
 *
 * The `*Tx` variants accept an existing transaction client so callers can
 * compose multiple operations; the public wrappers open their own transaction.
 */

async function lockWallet(tx: Tx, walletId: string) {
  // Row-level lock so concurrent balance operations serialize safely.
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
}

async function ensureWallet(tx: Tx, userId: string): Promise<Wallet> {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw Errors.notFound("Wallet not found for user.");
  return wallet;
}

async function writeLedgerCreditTx(
  tx: Tx,
  input: CreditInput,
  target: "pending" | "available",
  opts: { countsAsEarning?: boolean } = {},
): Promise<void> {
  const wallet = await ensureWallet(tx, input.userId);
  await lockWallet(tx, wallet.id);
  const balanceAfter =
    target === "pending"
      ? wallet.pendingBalance + input.amount
      : wallet.availableBalance + input.amount;
  await tx.ledgerTransaction.create({
    data: {
      userId: input.userId,
      walletId: wallet.id,
      type: input.type,
      direction: "CREDIT",
      amount: input.amount,
      balanceAfter,
      reference: input.reference ?? randomUUID(),
      description: input.description,
      meta: input.meta ?? undefined,
      opportunityId: input.opportunityId ?? null,
      rewardId: input.rewardId ?? null,
      withdrawalId: input.withdrawalId ?? null,
    },
  });
  if (target === "pending") {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { pendingBalance: { increment: input.amount } },
    });
  } else {
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { increment: input.amount },
        ...(opts.countsAsEarning
          ? { totalEarned: { increment: input.amount } }
          : {}),
      },
    });
  }
}

export async function creditPendingTx(tx: Tx, input: CreditInput): Promise<void> {
  await writeLedgerCreditTx(tx, input, "pending");
}

export async function creditAvailableTx(
  tx: Tx,
  input: CreditInput,
  opts: { countsAsEarning?: boolean } = {},
): Promise<void> {
  await writeLedgerCreditTx(tx, input, "available", opts);
}

export async function creditPending(client: PrismaOrTx, input: CreditInput): Promise<void> {
  await client.$transaction(async (tx) => creditPendingTx(tx, input));
}

export async function creditAvailable(
  client: PrismaOrTx,
  input: CreditInput,
  opts: { countsAsEarning?: boolean } = {},
): Promise<void> {
  await client.$transaction(async (tx) => creditAvailableTx(tx, input, opts));
}

/**
 * Atomically debit the available balance. Fails loudly (INSUFFICIENT_FUNDS)
 * when the balance cannot cover `amount`.
 */
export async function debitAvailableTx(tx: Tx, input: CreditInput): Promise<void> {
  const wallet = await ensureWallet(tx, input.userId);
  await lockWallet(tx, wallet.id);
  if (wallet.availableBalance < input.amount) {
    throw Errors.insufficientFunds();
  }
  const balanceAfter = wallet.availableBalance - input.amount;
  await tx.ledgerTransaction.create({
    data: {
      userId: input.userId,
      walletId: wallet.id,
      type: input.type,
      direction: "DEBIT",
      amount: input.amount,
      balanceAfter,
      reference: input.reference ?? randomUUID(),
      description: input.description,
      meta: input.meta ?? undefined,
      opportunityId: input.opportunityId ?? null,
      rewardId: input.rewardId ?? null,
      withdrawalId: input.withdrawalId ?? null,
    },
  });
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { availableBalance: { decrement: input.amount } },
  });
}

export async function debitAvailable(client: PrismaOrTx, input: CreditInput): Promise<void> {
  await client.$transaction(async (tx) => debitAvailableTx(tx, input));
}

/**
 * Move money from the pending balance into the available balance when a
 * PENDING reward passes validation. Same funds, same ledger row; the
 * transition is captured in the audit trail.
 */
export async function releasePendingToAvailableTx(
  tx: Tx,
  userId: string,
  amount: number,
  reference: string,
  ip?: string | null,
): Promise<void> {
  const wallet = await ensureWallet(tx, userId);
  await lockWallet(tx, wallet.id);
  if (wallet.pendingBalance < amount) {
    throw Errors.conflict("Pending balance cannot cover release.", "BALANCE_MISMATCH");
  }
  await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      pendingBalance: { decrement: amount },
      availableBalance: { increment: amount },
      totalEarned: { increment: amount },
    },
  });
  await tx.auditLog.create({
    data: {
      userId,
      action: "WALLET.PENDING_RELEASED",
      entityType: "Wallet",
      entityId: wallet.id,
      meta: { amount, reference },
      ipAddress: ip ?? null,
    },
  });
}

export async function releasePendingToAvailable(
  client: PrismaOrTx,
  userId: string,
  amount: number,
  reference: string,
  ip?: string | null,
): Promise<void> {
  await client.$transaction((tx) =>
    releasePendingToAvailableTx(tx, userId, amount, reference, ip),
  );
}

/** Restore funds to the available balance after a failed/cancelled withdrawal. */
export async function refundDebitTx(
  tx: Tx,
  input: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    withdrawalId?: string | null;
    ip?: string | null;
  },
): Promise<void> {
  const wallet = await ensureWallet(tx, input.userId);
  await lockWallet(tx, wallet.id);
  const balanceAfter = wallet.availableBalance + input.amount;
  await tx.ledgerTransaction.create({
    data: {
      userId: input.userId,
      walletId: wallet.id,
      type: "REVERSAL",
      direction: "CREDIT",
      amount: input.amount,
      balanceAfter,
      reference: input.reference,
      description: input.description,
      withdrawalId: input.withdrawalId ?? null,
    },
  });
  await tx.wallet.update({
    where: { id: wallet.id },
    data: { availableBalance: { increment: input.amount } },
  });
}

export async function refundDebit(
  client: PrismaOrTx,
  input: {
    userId: string;
    amount: number;
    reference: string;
    description: string;
    withdrawalId?: string | null;
    ip?: string | null;
  },
): Promise<void> {
  await client.$transaction((tx) => refundDebitTx(tx, input));
}

export async function getWallet(userId: string): Promise<Wallet> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw Errors.notFound("Wallet not found.");
  return wallet;
}

export async function listTransactions(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  return prisma.ledgerTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function addAdjustment(
  userId: string,
  amount: number,
  description: string,
  byUserId?: string,
): Promise<void> {
  if (amount === 0) return;
  if (amount > 0) {
    await creditAvailable(prisma, { userId, type: "ADJUSTMENT", amount, description });
  } else {
    await debitAvailable(prisma, { userId, type: "ADJUSTMENT", amount: Math.abs(amount), description });
  }
  await audit({ userId, action: "WALLET.ADJUSTMENT", meta: { amount, byUserId } });
}