import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import { createUser } from "./helpers";

import {
  createWithdrawal,
  cancelWithdrawal,
  listWithdrawals,
} from "../src/services/withdrawals";
import { creditAvailable } from "../src/services/wallet";

async function fund(userId: string, amount: number) {
  await creditAvailable(
    prisma,
    {
      userId,
      type: "REWARD",
      amount,
      description: "Earnings",
      reference: `fund-${userId}-${amount}`,
    },
    { countsAsEarning: true },
  );
}

describe("withdrawals", () => {
  it("rejects an amount below the configured minimum (default ₦500.00)", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 50000);
    await expect(
      createWithdrawal({
        userId: user.id,
        amount: 1000, // ₦10.00
        paymentMethod: "BANK_TRANSFER",
        paymentDetails: { accountName: "Ada", accountNumber: "0123456789", bankName: "Bank" },
      }),
    ).rejects.toMatchObject({ code: "BELOW_MINIMUM" });
  });

  it("creates a withdrawal, debits the ledger and is idempotent by key", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 100000);

    const first = await createWithdrawal({
      userId: user.id,
      amount: 50000,
      paymentMethod: "BANK_TRANSFER",
      paymentDetails: { accountName: "Ada", accountNumber: "0123456789", bankName: "Bank" },
      idempotencyKey: "idem-1",
    });
    const second = await createWithdrawal({
      userId: user.id,
      amount: 50000,
      paymentMethod: "BANK_TRANSFER",
      paymentDetails: { accountName: "Ada", accountNumber: "0123456789", bankName: "Bank" },
      idempotencyKey: "idem-1",
    });
    expect(second.id).toBe(first.id); // same request, same result

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableBalance).toBe(50000);

    const withdrawals = await listWithdrawals(user.id);
    expect(withdrawals).toHaveLength(1);
    expect(withdrawals[0].status).toBe("PENDING");
    const debit = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { userId: user.id, type: "WITHDRAWAL" },
    });
    expect(debit.amount).toBe(50000);
    expect(debit.reference).toBe(withdrawals[0].reference);
  });

  it("refuses when withdrawing more than the available balance", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 50000); // exactly the minimum
    await expect(
      createWithdrawal({
        userId: user.id,
        amount: 60000,
        paymentMethod: "BANK_TRANSFER",
        paymentDetails: { accountNumber: "0123456789" },
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("allows only one in-flight withdrawal at a time", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 200000);
    await createWithdrawal({
      userId: user.id,
      amount: 50000,
      paymentMethod: "BANK_TRANSFER",
      paymentDetails: { accountNumber: "0123456789" },
    });
    await expect(
      createWithdrawal({
        userId: user.id,
        amount: 50000,
        paymentMethod: "BANK_TRANSFER",
        paymentDetails: { accountNumber: "0123456789" },
      }),
    ).rejects.toMatchObject({ code: "WITHDRAWAL_IN_FLIGHT" });
  });

  it("requires email verification before withdrawing", async () => {
    const user = await createUser({ verified: false });
    await expect(
      createWithdrawal({
        userId: user.id,
        amount: 50000,
        paymentMethod: "BANK_TRANSFER",
        paymentDetails: { accountNumber: "0123456789" },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("cancels a pending withdrawal and refunds the full amount to the ledger", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 200000);
    const created = await createWithdrawal({
      userId: user.id,
      amount: 50000,
      paymentMethod: "BANK_TRANSFER",
      paymentDetails: { accountNumber: "0123456789" },
    });

    const cancelled = await cancelWithdrawal(user.id, created.id);
    expect(cancelled.status).toBe("CANCELLED");

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableBalance).toBe(200000); // restored
    expect(wallet.totalEarned).toBe(200000); // unchanged

    const reversal = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { userId: user.id, type: "REVERSAL" },
    });
    expect(reversal.amount).toBe(50000);
    expect(reversal.withdrawalId).toBe(created.id);
    expect(reversal.reference).toBe(`WDREF-${created.reference}`);
  });

  it("cannot cancel a withdrawal that has been paid out", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 200000);
    const created = await createWithdrawal({
      userId: user.id,
      amount: 50000,
      paymentMethod: "BANK_TRANSFER",
      paymentDetails: { accountNumber: "0123456789" },
    });
    // PENDING/PROCESSING are cancellable; a paid (SUCCESS) withdrawal is not.
    await prisma.withdrawal.update({
      where: { id: created.id },
      data: { status: "SUCCESS" },
    });
    await expect(cancelWithdrawal(user.id, created.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(cancelWithdrawal(user.id, "non-existent")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("never exposes SUCCESS without a provider confirmation path", async () => {
    const user = await createUser({ verified: true });
    await fund(user.id, 200000);
    const created = await createWithdrawal({
      userId: user.id,
      amount: 50000,
      paymentMethod: "BANK_TRANSFER",
      paymentDetails: { accountNumber: "0123456789" },
    });
    const rows = await listWithdrawals(user.id);
    expect(rows[0].status === "PENDING").toBe(true);
    expect(Object.keys(rows[0])).not.toContain("paymentDetails"); // sensitive data never returned
    // totalWithdrawn only moves on SUCCESS (Part 3 provider confirmation)
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.totalWithdrawn).toBe(0);
    void created;
  });
});