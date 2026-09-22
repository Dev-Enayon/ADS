import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import { createUser, createOpportunity } from "./helpers";
import {
  createReferralForNewUser,
  getReferralSummary,
  maskEmail,
  maybeCreditReferrer,
} from "../src/services/referrals";
import { startWatchSession, completeWatchSession } from "../src/services/watch";
import { releaseEligiblePendingRewards } from "../src/services/rewards";

describe("referrals", () => {
  it("creates a pending referral linking a referred user", async () => {
    const referrer = await createUser();
    const referred = await createUser();
    await createReferralForNewUser({
      tx: prisma,
      referredUserId: referred.id,
      referralCode: referrer.referralCode,
    });
    const row = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referred.id } });
    expect(row.referrerId).toBe(referrer.id);
    expect(row.status).toBe("PENDING");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    expect(updated.referredById).toBe(referrer.id);
  });

  it("rejects an invalid referral code", async () => {
    const referred = await createUser();
    await expect(
      createReferralForNewUser({ tx: prisma, referredUserId: referred.id, referralCode: "RHXXXXXX" }),
    ).rejects.toThrowError(/not valid/i);
  });

  it("rejects self-referral", async () => {
    const user = await createUser();
    await expect(
      createReferralForNewUser({ tx: prisma, referredUserId: user.id, referralCode: user.referralCode }),
    ).rejects.toThrowError(/cannot refer yourself/i);
  });

  it("rejects a user who already has a referral", async () => {
    const referrer = await createUser();
    const referred = await createUser();
    await createReferralForNewUser({ tx: prisma, referredUserId: referred.id, referralCode: referrer.referralCode });
    await expect(
      createReferralForNewUser({ tx: prisma, referredUserId: referred.id, referralCode: referrer.referralCode }),
    ).rejects.toMatchObject({ code: "ALREADY_REFERRED" });
  });

  it("rewards the referrer exactly once when the referred user receives their first available reward", async () => {
    const referrer = await createUser();
    const referred = await createUser({ verified: true });
    await createReferralForNewUser({ tx: prisma, referredUserId: referred.id, referralCode: referrer.referralCode });

    // Referred user completes their first video -> reward becomes AVAILABLE,
    // which triggers the single referrer credit.
    const opp = await createOpportunity({ durationSeconds: 5, rewardAmount: 5000 });
    const session = await startWatchSession({ userId: referred.id, opportunityId: opp.id });
    await prisma.watchSession.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 10_000) },
    });
    await completeWatchSession({ userId: referred.id, watchSessionId: session.id });
    await releaseEligiblePendingRewards();

    const referrerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } });
    expect(referrerWallet.availableBalance).toBe(2000); // default REFERRAL_REWARD_AMOUNT

    // Second reward does not double-pay.
    const opp2 = await createOpportunity({ durationSeconds: 5, rewardAmount: 3000 });
    const session2 = await startWatchSession({ userId: referred.id, opportunityId: opp2.id });
    await prisma.watchSession.update({
      where: { id: session2.id },
      data: { startedAt: new Date(Date.now() - 10_000) },
    });
    await completeWatchSession({ userId: referred.id, watchSessionId: session2.id });
    await releaseEligiblePendingRewards();
    const creditedAgain = await maybeCreditReferrer(referred.id);
    expect(creditedAgain).toBe(false);

    const referrerWallet2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } });
    expect(referrerWallet2.availableBalance).toBe(2000); // unchanged

    const summary = await getReferralSummary(referrer.id);
    expect(summary.totalInvites).toBe(1);
    expect(summary.completedInvites).toBe(1);
    expect(summary.totalRewarded).toBe(2000);
    expect(summary.invites[0].email).toContain("•"); // masked email

    const referral = await prisma.referral.findUniqueOrThrow({
      where: { referredUserId: referred.id },
    });
    expect(referral.status).toBe("COMPLETED");
    expect(referral.amount).toBe(2000);
  });

  it("does not reward a PENDING referral without an available reward", async () => {
    const referrer = await createUser();
    const referred = await createUser();
    await createReferralForNewUser({ tx: prisma, referredUserId: referred.id, referralCode: referrer.referralCode });
    const result = await maybeCreditReferrer(referred.id);
    expect(result).toBe(false);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } });
    expect(wallet.availableBalance).toBe(0);
  });
});

describe("maskEmail", () => {
  it("masks the local part but keeps the domain", () => {
    expect(maskEmail("ada.nwosu@example.com")).toBe("ad•••su@example.com");
    expect(maskEmail("ab@x.com")).toBe("ab••@x.com");
  });
});