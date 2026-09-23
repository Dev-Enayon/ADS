import { describe, expect, it, vi } from "vitest";

import { prisma } from "../src/lib/db";
import { createUser, createAdmin, fundUser } from "./helpers";
import { createWithdrawal } from "../src/services/withdrawals";
import {
  startWithdrawalPayout,
  confirmPayoutSuccess,
  recordPayoutFailure,
  reversePayout,
} from "../src/services/payouts/payouts";
import { processPayoutWebhook } from "../src/services/payouts/webhook-handler";
import {
  computeWebhookSignature,
  verifyWebhookSignature,
  WebhookSignatureError,
} from "../src/lib/payments/webhook";
import { WithdrawalStatus } from "../src/generated/prisma/enums";

// One-shot switch so a single test can make the provider refuse to dispatch
// without stubbing the rest of the lifecycle.
const providerControl = vi.hoisted(() => ({ failNext: false }));

vi.mock("@/lib/payouts/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/payouts/provider")>();
  return {
    ...actual,
    configuredPayoutProvider: () => {
      const provider = actual.configuredPayoutProvider();
      if (!providerControl.failNext) return provider;
      providerControl.failNext = false;
      return {
        name: `${provider.name} (failing)`,
        startPayout: async () => {
          throw new Error("Provider refused to dispatch.");
        },
      };
    },
  };
});

const SECRET = "test-payout-webhook-secret";

const BANK_DETAILS = { accountName: "Ada", accountNumber: "0123456789", bankName: "Test Bank" };

async function makeWithdrawal(amount = 100000) {
  const user = await createUser({ verified: true });
  await fundUser(user.id, amount);
  const withdrawal = await createWithdrawal({
    userId: user.id,
    amount,
    paymentMethod: "BANK_TRANSFER",
    paymentDetails: BANK_DETAILS,
  });
  return { user, withdrawal };
}

describe("webhook signature", () => {
  it("verifies the exact raw body and rejects tampering or wrong secrets", () => {
    const body = '{"event":"payout.success","providerRef":"PAYOUT-1"}';

    const correct = `sha512=${computeWebhookSignature(body, SECRET)}`;
    expect(verifyWebhookSignature(body, correct, SECRET)).toBe(true);
    // Prefix-less form is accepted too.
    expect(verifyWebhookSignature(body, correct.slice("sha512=".length), SECRET)).toBe(true);
    // Wrong secret, missing signature, extra byte, different secret.
    expect(verifyWebhookSignature(body, correct, "other-secret")).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body + "\n", correct, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, `sha512=${"0".repeat(correct.length - "sha512=".length)}`, SECRET)).toBe(false);
  });
});

describe("payout lifecycle", () => {
  it("dispatches a pending withdrawal to the provider and persists its reference", async () => {
    const admin = await createAdmin();
    const { withdrawal } = await makeWithdrawal();

    const dispatched = await startWithdrawalPayout({
      withdrawalId: withdrawal.id,
      actorId: admin.id,
    });
    expect(dispatched.status).toBe(WithdrawalStatus.PROCESSING);

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.providerRef).toBeTruthy();
    expect(row.providerStatus).toBeTruthy();
    expect(row.payoutAttempts).toBe(1);
    expect(row.processedById).toBe(admin.id);
  });

  it("cannot dispatch the same withdrawal twice", async () => {
    const admin = await createAdmin();
    const { withdrawal } = await makeWithdrawal();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id });
    await expect(
      startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("reverts to PENDING and keeps the attempt trail when the provider refuses", async () => {
    const admin = await createAdmin();
    const { withdrawal } = await makeWithdrawal();

    providerControl.failNext = true;
    await expect(
      startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "PAYOUT_DISPATCH_FAILED" });

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.PENDING);
    expect(row.payoutAttempts).toBe(1);
    expect(row.providerRef).toBeNull();

    // The flag is one-shot: a retry dispatches normally.
    const retried = await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id });
    expect(retried.status).toBe(WithdrawalStatus.PROCESSING);
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } })).payoutAttempts).toBe(2);
  });

  it("moves PENDING -> SUCCESS, increments totalWithdrawn once", async () => {
    const { user, withdrawal } = await makeWithdrawal();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: user.id });

    const ok = await confirmPayoutSuccess({ withdrawalId: withdrawal.id, providerRef: "PAYOUT-X" });
    expect(ok).toBe(true);

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.SUCCESS);
    expect(row.processedAt).not.toBeNull();

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.totalWithdrawn).toBe(withdrawal.amount);
    expect(wallet.availableBalance).toBe(0);

    // Second settlement attempt is a no-op (guarded).
    await expect(confirmPayoutSuccess({ withdrawalId: withdrawal.id })).resolves.toBe(false);
  });

  it("refunds the full amount when a payout fails", async () => {
    const { user, withdrawal } = await makeWithdrawal();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: user.id });

    const ok = await recordPayoutFailure({
      withdrawalId: withdrawal.id,
      failureReason: "Bank account rejected.",
    });
    expect(ok).toBe(true);

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.FAILED);
    expect(row.failureReason).toBe("Bank account rejected.");

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableBalance).toBe(withdrawal.amount); // restored
    const reversal = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { withdrawalId: withdrawal.id, type: "REVERSAL" },
    });
    expect(reversal.reference).toBe(`WDREF-${row.reference}`);
  });

  it("reverses only a SUCCESS payout and restores the ledger", async () => {
    const { user, withdrawal } = await makeWithdrawal();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: user.id });
    await confirmPayoutSuccess({ withdrawalId: withdrawal.id });

    const ok = await reversePayout({
      withdrawalId: withdrawal.id,
      reason: "Bank sendback.",
    });
    expect(ok).toBe(true);

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.REVERSED);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.totalWithdrawn).toBe(0);
    expect(wallet.availableBalance).toBe(withdrawal.amount); // back in the wallet

    // A PENDING payout is not reversible.
    const { withdrawal: other } = await makeWithdrawal();
    await expect(reversePayout({ withdrawalId: other.id })).resolves.toBe(false);
  });
});

describe("payout webhook processing", () => {
  it("rejects an unauthenticated payload before touching anything", async () => {
    await expect(
      processPayoutWebhook({
        rawBody: '{"event":"payout.success"}',
        signature: null,
        secret: SECRET,
      }),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(prisma.webhookEvent.count()).resolves.toBe(0);
  });

  it("settles a dispatched payout on a signed success event, idempotently", async () => {
    const { user, withdrawal } = await makeWithdrawal();
    const admin = await createAdmin();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id });

    const payload = {
      id: "payout-ev-1",
      event: "payout.success",
      providerRef: (await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } })).providerRef,
      withdrawalId: withdrawal.id,
    };
    const rawBody = JSON.stringify(payload);
    const signature = computeWebhookSignature(rawBody, SECRET);

    const first = await processPayoutWebhook({
      rawBody,
      signature: `sha512=${signature}`,
      secret: SECRET,
      provider: "DEV_MOCK",
    });
    expect(first.outcome).toBe("processed");

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.SUCCESS);
    expect(row.providerStatus).toBe("succeeded");
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.totalWithdrawn).toBe(withdrawal.amount);
    await expect(
      prisma.notification.count({ where: { userId: user.id, type: "PAYOUT_SUCCEEDED" } }),
    ).resolves.toBe(1);

    // Redelivery is idempotent: no double settlement.
    const second = await processPayoutWebhook({
      rawBody,
      signature: `sha512=${signature}`,
      secret: SECRET,
      provider: "DEV_MOCK",
    });
    expect(second.outcome).toBe("duplicate");
    const after = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(after.totalWithdrawn).toBe(withdrawal.amount);
  });

  it("records a payout failure and refunds the member on a signed failed event", async () => {
    const { user, withdrawal } = await makeWithdrawal();
    const admin = await createAdmin();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id });

    const payload = {
      id: "payout-ev-2",
      event: "payout.failed",
      withdrawalId: withdrawal.id,
      failureReason: "Insufficient funds at provider.",
    };
    const rawBody = JSON.stringify(payload);
    const signature = computeWebhookSignature(rawBody, SECRET);

    const result = await processPayoutWebhook({
      rawBody,
      signature: `sha512=${signature}`,
      secret: SECRET,
      provider: "DEV_MOCK",
    });
    expect(result.outcome).toBe("processed");

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.FAILED);
    expect(row.providerStatus).toBe("failed");
    expect(row.failureReason).toBe("Insufficient funds at provider.");
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableBalance).toBe(withdrawal.amount);
  });

  it("reverses a paid payout on a signed reversed event", async () => {
    const { user, withdrawal } = await makeWithdrawal();
    const admin = await createAdmin();
    await startWithdrawalPayout({ withdrawalId: withdrawal.id, actorId: admin.id });
    await confirmPayoutSuccess({ withdrawalId: withdrawal.id });

    const payload = {
      id: "payout-ev-3",
      event: "payout.reversed",
      withdrawalId: withdrawal.id,
      reason: "Disputed transaction.",
    };
    const rawBody = JSON.stringify(payload);
    const signature = computeWebhookSignature(rawBody, SECRET);

    const result = await processPayoutWebhook({
      rawBody,
      signature: `sha512=${signature}`,
      secret: SECRET,
      provider: "DEV_MOCK",
    });
    expect(result.outcome).toBe("processed");

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe(WithdrawalStatus.REVERSED);
    expect(row.failureReason).toBe("Disputed transaction.");
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableBalance).toBe(withdrawal.amount);
  });

  it("marks an unknown payout target as ignored instead of failing", async () => {
    const payload = {
      id: "payout-ev-4",
      event: "payout.success",
      providerRef: "PAYOUT-DOES-NOT-EXIST",
    };
    const rawBody = JSON.stringify(payload);
    const signature = computeWebhookSignature(rawBody, SECRET);

    const result = await processPayoutWebhook({
      rawBody,
      signature: `sha512=${signature}`,
      secret: SECRET,
      provider: "DEV_MOCK",
    });
    expect(result.outcome).toBe("ignored");
    const row = await prisma.webhookEvent.findFirstOrThrow({
      where: { providerEventId: "payout-ev-4" },
    });
    expect(row.status).toBe("IGNORED");
  });
});