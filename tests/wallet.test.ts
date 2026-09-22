import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import { createUser, createOpportunity } from "./helpers";

import {
  creditPending,
  creditAvailable,
  debitAvailable,
  releasePendingToAvailable,
  refundDebit,
  getWallet,
  listTransactions,
} from "../src/services/wallet";
import { startWatchSession, completeWatchSession } from "../src/services/watch";
import { releaseEligiblePendingRewards } from "../src/services/rewards";

describe("wallet ledger", () => {
  it("credits pending then releases to available with correct ledger rows", async () => {
    const user = await createUser();
    await creditPending(prisma, {
      userId: user.id,
      type: "REWARD",
      amount: 1000,
      description: "Test reward",
      reference: "ref-pending-1",
    });
    let wallet = await getWallet(user.id);
    expect(wallet.pendingBalance).toBe(1000);
    expect(wallet.availableBalance).toBe(0);

    await releasePendingToAvailable(prisma, user.id, 1000, "ref-pending-1", "127.0.0.1");
    wallet = await getWallet(user.id);
    expect(wallet.pendingBalance).toBe(0);
    expect(wallet.availableBalance).toBe(1000);
    expect(wallet.totalEarned).toBe(1000);

    const txs = await listTransactions(user.id);
    expect(txs.filter((t) => t.type === "REWARD").length).toBe(1);
    expect(txs.some((t) => t.balanceAfter === 1000 && t.direction === "CREDIT")).toBe(true);
  });

  it("debits the available balance and refuses insufficient funds", async () => {
    const user = await createUser();
    await creditAvailable(prisma, {
      userId: user.id,
      type: "BONUS",
      amount: 500,
      description: "Bonus",
      reference: "ref-credit-1",
    });
    await debitAvailable(prisma, {
      userId: user.id,
      type: "WITHDRAWAL",
      amount: 300,
      description: "Withdrawal",
      reference: "ref-debit-1",
    });
    let wallet = await getWallet(user.id);
    expect(wallet.availableBalance).toBe(200);

    await expect(
      debitAvailable(prisma, {
        userId: user.id,
        type: "WITHDRAWAL",
        amount: 500,
        description: "Overdraft attempt",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    wallet = await getWallet(user.id);
    expect(wallet.availableBalance).toBe(200);
  });

  it("refunds a debit via a REVERSAL ledger entry without changing totalEarned", async () => {
    const user = await createUser();
    await creditAvailable(
      prisma,
      {
        userId: user.id,
        type: "REWARD",
        amount: 2000,
        description: "Earnings",
        reference: "ref-e-1",
      },
      { countsAsEarning: true },
    );
    await debitAvailable(prisma, {
      userId: user.id,
      type: "WITHDRAWAL",
      amount: 2000,
      description: "Withdrawal",
      reference: "WD-TEST",
    });

    await refundDebit(prisma, {
      userId: user.id,
      amount: 2000,
      reference: "WDREF-WD-TEST",
      description: "Withdrawal cancelled · funds returned",
    });

    const wallet = await getWallet(user.id);
    expect(wallet.availableBalance).toBe(2000); // funds restored
    expect(wallet.totalEarned).toBe(2000); // earning untouched by refund

    const txs = await listTransactions(user.id);
    expect(txs.filter((t) => t.type === "REVERSAL").length).toBe(1);
    expect(txs.filter((t) => t.type === "WITHDRAWAL").length).toBe(1);
  });

  it("rejects a pending release that exceeds the pending balance", async () => {
    const user = await createUser();
    await expect(
      releasePendingToAvailable(prisma, user.id, 999, "ref-none"),
    ).rejects.toMatchObject({ code: "BALANCE_MISMATCH" });
  });
});

describe("watch session financial integrity", () => {
  it("grants exactly one reward and one REWARD ledger row per completed session", async () => {
    const user = await createUser({ verified: true });
    const opp = await createOpportunity({ durationSeconds: 5, rewardAmount: 5000 });

    const session = await startWatchSession({ userId: user.id, opportunityId: opp.id });
    // Simulate elapsed time so the wall-clock check passes.
    await prisma.watchSession.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 10_000) },
    });

    const { reward } = await completeWatchSession({
      userId: user.id,
      watchSessionId: session.id,
    });

    expect(reward.amount).toBe(5000);
    // Reward starts PENDING and becomes AVAILABLE once the validation
    // delay (default 0s) elapses — release runs on balance reads.
    const released = await releaseEligiblePendingRewards();
    expect(released).toBe(1);
    const wallet = await getWallet(user.id);
    expect(wallet.pendingBalance).toBe(0);
    expect(wallet.availableBalance).toBe(5000);
    expect(wallet.totalEarned).toBe(5000);

    const rewards = await prisma.reward.findMany({ where: { userId: user.id } });
    expect(rewards.length).toBe(1);
    const txs = await listTransactions(user.id);
    expect(txs.filter((t) => t.type === "REWARD" && t.direction === "CREDIT").length).toBe(1);

    // Double completion is rejected by the atomic status guard.
    await prisma.watchSession.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 30_000) },
    });
    await expect(
      completeWatchSession({ userId: user.id, watchSessionId: session.id }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_ACTIVE" });
  });

  it("does not credit when elapsed watch time is below the required duration", async () => {
    const user = await createUser({ verified: true });
    const opp = await createOpportunity({ durationSeconds: 60, rewardAmount: 5000 });
    const session = await startWatchSession({ userId: user.id, opportunityId: opp.id });

    await expect(
      completeWatchSession({ userId: user.id, watchSessionId: session.id }),
    ).rejects.toMatchObject({ code: "WATCH_INCOMPLETE" });

    const wallet = await getWallet(user.id);
    expect(wallet.availableBalance).toBe(0);
    expect(await prisma.reward.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects completion by another user (ownership)", async () => {
    const owner = await createUser({ verified: true });
    const attacker = await createUser({ verified: true });
    const opp = await createOpportunity({ durationSeconds: 5, rewardAmount: 5000 });
    const session = await startWatchSession({ userId: owner.id, opportunityId: opp.id });
    await prisma.watchSession.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 10_000) },
    });

    await expect(
      completeWatchSession({ userId: attacker.id, watchSessionId: session.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks unverified and un-earnable accounts from starting", async () => {
    const unverified = await createUser({ verified: false });
    const opp = await createOpportunity();
    await expect(
      startWatchSession({ userId: unverified.id, opportunityId: opp.id }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("stops against an unreachable opportunity (at its completion limit)", async () => {
    const user = await createUser({ verified: true });
    const opp = await createOpportunity({ durationSeconds: 5, rewardAmount: 1000, maxCompletions: 0 });
    await expect(
      startWatchSession({ userId: user.id, opportunityId: opp.id }),
    ).rejects.toMatchObject({ code: "OPPORTUNITY_UNAVAILABLE" });
  });

  it("enforces the max active session limit", async () => {
    const user = await createUser({ verified: true });
    const a = await createOpportunity();
    const b = await createOpportunity();
    const c = await createOpportunity();
    const d = await createOpportunity();
    await startWatchSession({ userId: user.id, opportunityId: a.id });
    await startWatchSession({ userId: user.id, opportunityId: b.id });
    await startWatchSession({ userId: user.id, opportunityId: c.id });
    await expect(
      startWatchSession({ userId: user.id, opportunityId: d.id }),
    ).rejects.toMatchObject({ code: "TOO_MANY_ACTIVE_SESSIONS" });
  });
});