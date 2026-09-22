import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import { TeamRole } from "../src/generated/prisma/enums";
import { createUser } from "./helpers";

import { createAdvertiserProfile, addMember, updateMemberRole, removeMember, listMembers } from "../src/services/advertisers";
import { initializeFunding, verifyFunding, allocateToCampaign, getBillingSummary } from "../src/services/funding";
import { createCampaign, submitCampaignForReview, pauseCampaign, resumeCampaign, cancelCampaign, getCampaignDetail } from "../src/services/campaigns";
import { startWatchSession, completeWatchSession } from "../src/services/watch";
import { listOpportunities, getEligibleOpportunity } from "../src/services/opportunities";
import { releaseEligiblePendingRewards } from "../src/services/rewards";

const FAKE_VIDEO = "https://cdn.test.invalid/video.mp4";

async function setupAdvertiser(opts: { businessEmail?: string } = {}) {
  const owner = await createUser();
  const advertiser = await createAdvertiserProfile(owner.id, {
    businessName: "Test Brand",
    businessEmail: opts.businessEmail ?? `brand-${owner.email}@test.dev`,
    businessDescription: "Integration test business",
  });
  return { owner, advertiser };
}

/** Creates a funded, ACTIVE campaign with a video creative. */
async function setupLiveCampaign(opts: {
  rewardPerCompletion?: number;
  maxCompletions?: number;
  fundAmount?: number;
} = {}) {
  const rewardPerCompletion = opts.rewardPerCompletion ?? 5000;
  const maxCompletions = opts.maxCompletions ?? 100;
  const { owner, advertiser } = await setupAdvertiser();

  const { campaign } = await createCampaign(owner.id, {
    name: "Sponsored launch",
    description: "Test description",
    objective: "BRAND_AWARENESS",
    rewardPerCompletion,
    maxCompletions,
  } as never);

  await prisma.creative.create({
    data: {
      campaignId: campaign.id,
      type: "VIDEO",
      title: "Launch teaser",
      videoUrl: FAKE_VIDEO,
      durationSeconds: 15,
      status: "ACTIVE",
      meta: { durationVerified: false },
    },
  });

  const fundAmount = opts.fundAmount ?? rewardPerCompletion * maxCompletions;
  const funding = await initializeFunding(owner.id, { amount: fundAmount });
  await verifyFunding(owner.id, funding.id);

  const result = await submitCampaignForReview(owner.id, campaign.id);
  return { owner, advertiser, campaign, result };
}

describe("advertiser profile", () => {
  it("creates a profile with wallet + OWNER membership and auto-activates in dev", async () => {
    const { owner, advertiser } = await setupAdvertiser();
    expect(advertiser.status).toBe("ACTIVE");
    expect(advertiser.businessName).toBe("Test Brand");

    const wallet = await prisma.advertiserWallet.findUnique({
      where: { advertiserId: advertiser.id },
    });
    expect(wallet).not.toBeNull();
    expect(wallet!.availableBalance).toBe(0);

    const members = await listMembers(advertiser.id);
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe(TeamRole.OWNER);
    expect(members[0].user.id).toBe(owner.id);
  });

  it("rejects a second advertiser profile for the same user", async () => {
    const { owner } = await setupAdvertiser();
    await expect(
      createAdvertiserProfile(owner.id, { businessName: "Dupe", businessEmail: "d@test.dev" }),
    ).rejects.toMatchObject({ code: "ADVERTISER_EXISTS" });
  });
});

describe("advertiser team", () => {
  it("owner adds a MANAGER and an ANALYST; duplicates are rejected", async () => {
    const { owner, advertiser } = await setupAdvertiser();
    const manager = await createUser();
    const analyst = await createUser();

    await addMember(owner.id, { email: manager.email, role: TeamRole.MANAGER });
    await addMember(owner.id, { email: analyst.email, role: TeamRole.ANALYST });

    const members = await listMembers(advertiser.id);
    expect(members).toHaveLength(3);

    await expect(
      addMember(owner.id, { email: manager.email, role: TeamRole.MANAGER }),
    ).rejects.toMatchObject({ code: "MEMBER_EXISTS" });
  });

  it("a MANAGER can add an ANALYST but not another MANAGER", async () => {
    const { owner } = await setupAdvertiser();
    const manager = await createUser();
    const invitee = await createUser();
    await addMember(owner.id, { email: manager.email, role: TeamRole.MANAGER });

    await addMember(manager.id, { email: invitee.email, role: TeamRole.ANALYST });
    await expect(
      addMember(manager.id, { email: (await createUser()).email, role: TeamRole.MANAGER }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("only the owner can change roles or remove members", async () => {
    const { owner, advertiser } = await setupAdvertiser();
    const analyst = await createUser();
    await addMember(owner.id, { email: analyst.email, role: TeamRole.ANALYST });

    const member = (await listMembers(advertiser.id)).find((m) => m.user.id === analyst.id);
    expect(member).toBeTruthy();

    await expect(updateMemberRole(analyst.id, member!.id, TeamRole.MANAGER)).rejects.toMatchObject({
      status: 403,
    });
    await expect(removeMember(analyst.id, member!.id)).rejects.toMatchObject({ status: 403 });

    const updated = await updateMemberRole(owner.id, member!.id, TeamRole.MANAGER);
    expect(updated.role).toBe(TeamRole.MANAGER);

    await removeMember(owner.id, member!.id);
    const remaining = await listMembers(advertiser.id);
    expect(remaining).toHaveLength(1);
  });
});

describe("funding & allocation", () => {
  it("initializeFunding creates an intent without moving money, then verifyFunding credits the wallet exactly once", async () => {
    const { owner, advertiser } = await setupAdvertiser();

    const funding = await initializeFunding(owner.id, { amount: 500_00 });

    let wallet = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(wallet!.availableBalance).toBe(0); // no money moved yet
    expect(funding.status).toBe("PENDING_VERIFICATION");

    const verified = await verifyFunding(owner.id, funding.id);
    expect(verified.credited).toBe(true);
    expect(verified.status).toBe("COMPLETED");

    wallet = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(wallet!.availableBalance).toBe(500_00);
    expect(wallet!.totalFunded).toBe(500_00);

    const ledger = await prisma.advertiserLedgerTransaction.count({
      where: { advertiserId: advertiser.id, type: "FUNDING_CREDIT" },
    });
    expect(ledger).toBe(1);

    // Idempotent: a second verification must not double-credit.
    await expect(verifyFunding(owner.id, funding.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    wallet = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(wallet!.availableBalance).toBe(500_00);
  });

  it("keys funding by idempotency key and rejects amount mismatches", async () => {
    const { owner } = await setupAdvertiser();
    const first = await initializeFunding(owner.id, { amount: 1000, idempotencyKey: "k-1" });
    const second = await initializeFunding(owner.id, { amount: 1000, idempotencyKey: "k-1" });
    expect(second.id).toBe(first.id);

    await expect(
      initializeFunding(owner.id, { amount: 2000, idempotencyKey: "k-1" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_MISMATCH" });
  });

  it("allocateToCampaign moves wallet funds to a draft campaign and guards overspend", async () => {
    const { owner, advertiser } = await setupAdvertiser();

    const { campaign } = await createCampaign(owner.id, {
      name: "Budget test",
      objective: "ENGAGEMENT",
      rewardPerCompletion: 5000,
      maxCompletions: 100,
    } as never);

    const funding = await initializeFunding(owner.id, { amount: 400_000 });
    await verifyFunding(owner.id, funding.id);

    const result = await allocateToCampaign(owner.id, campaign.id, 400_000);
    expect(result.campaign!.allocatedAmount).toBe(400_000);
    expect(result.campaign!.remainingBudget).toBe(400_000);

    let wallet = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(wallet!.availableBalance).toBe(0);

    // Over-allocation beyond the remaining planned budget (100_000 left)
    await expect(allocateToCampaign(owner.id, campaign.id, 100_001)).rejects.toMatchObject({ code: "OVER_ALLOCATION" });

    // Insufficient wallet funds
    await expect(
      allocateToCampaign(owner.id, campaign.id, 100_000),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    wallet = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(wallet!.availableBalance).toBe(0);
  });

  it("billing summary reflects wallet and campaign totals", async () => {
    const { owner, advertiser } = await setupAdvertiser();
    const funding = await initializeFunding(owner.id, { amount: 100_00 });
    await verifyFunding(owner.id, funding.id);

    const summary = await getBillingSummary(advertiser.id);
    expect(summary.wallet.availableBalance).toBe(100_00);
    expect(summary.wallet.totalFunded).toBe(100_00);
  });
});

describe("campaign lifecycle", () => {
  it("creates a DRAFT with a server-computed budget and enforces reward rules", async () => {
    const { owner } = await setupAdvertiser();
    const { campaign } = await createCampaign(owner.id, {
      name: "Rules test",
      objective: "APP_INSTALL",
      rewardPerCompletion: 3000,
      maxCompletions: 250,
    } as never);

    expect(campaign.status).toBe("DRAFT");
    expect(campaign.budget).toBe(3000 * 250);
    expect(campaign.allocatedAmount).toBe(0);

    await expect(
      createCampaign(owner.id, {
        name: "Too cheap",
        objective: "OTHER",
        rewardPerCompletion: 1, // below min (100 kobo)
        maxCompletions: 100,
      } as never),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("requires a video creative before submission", async () => {
    const { owner } = await setupAdvertiser();
    const { campaign } = await createCampaign(owner.id, {
      name: "No creative",
      objective: "BRAND_AWARENESS",
      rewardPerCompletion: 5000,
      maxCompletions: 100,
    } as never);

    await expect(submitCampaignForReview(owner.id, campaign.id)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("submits, auto-approves in dev, and activates the feed opportunity", async () => {
    const { advertiser, campaign } = await setupLiveCampaign();

    const updated = await getCampaignDetail(advertiser.id, campaign.id);
    expect(updated.status).toBe("ACTIVE");
    expect(updated.allocatedAmount).toBe(updated.budget);

    const opp = await prisma.opportunity.findFirst({ where: { campaignId: campaign.id } });
    expect(opp).not.toBeNull();
    expect(opp!.status).toBe("ACTIVE");
    expect(opp!.rewardAmount).toBe(5000);
    expect(opp!.source).toBe("ADVERTISER");

    const viewer = await createUser();
    const feed = await listOpportunities(viewer.id);
    const listed = feed.find((o) => o.id === opp!.id);
    expect(listed).toBeTruthy();
    expect(listed!.eligible).toBe(true);
  });

  it("pause hides the campaign from the feed; resume restores it", async () => {
    const { owner, campaign } = await setupLiveCampaign();

    await pauseCampaign(owner.id, campaign.id);
    const opp = await prisma.opportunity.findFirst({ where: { campaignId: campaign.id } });
    expect(opp!.status).toBe("PAUSED");
    await expect(getEligibleOpportunity(opp!.id)).rejects.toMatchObject({ code: "OPPORTUNITY_UNAVAILABLE" });

    await resumeCampaign(owner.id, campaign.id);
    const afterResume = await getEligibleOpportunity(opp!.id);
    expect(afterResume.id).toBe(opp!.id);
  });
});

describe("campaign economics at reward time", () => {
  it("grants a reward, draws down campaign budget, and tracks wallet spend", async () => {
    const rewardPerCompletion = 5000;
    const { advertiser, campaign } = await setupLiveCampaign({ rewardPerCompletion });

    const viewer = await createUser();
    const opp = await prisma.opportunity.findFirst({ where: { campaignId: campaign.id } });
    const session = await startWatchSession({ userId: viewer.id, opportunityId: opp!.id });
    await prisma.watchSession.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 20_000) },
    });

    const { reward } = await completeWatchSession({ userId: viewer.id, watchSessionId: session.id });
    expect(reward.amount).toBe(rewardPerCompletion);

    const campaignAfter = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(campaignAfter!.currentCompletions).toBe(1);
    expect(campaignAfter!.completedViews).toBe(1);
    expect(campaignAfter!.spentAmount).toBe(rewardPerCompletion);
    expect(campaignAfter!.remainingBudget).toBe(campaignAfter!.budget - rewardPerCompletion);

    const wallet = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(wallet!.totalSpent).toBe(rewardPerCompletion);

    const oppAfter = await prisma.opportunity.findUnique({ where: { id: opp!.id } });
    expect(oppAfter!.currentCompletions).toBe(1);
  });

  it("stops paying once the budget runs dry and rolls back failed completions atomically", async () => {
    const rewardPerCompletion = 5000;
    const maxCompletions = 50;
    const budget = rewardPerCompletion * maxCompletions;
    const { campaign } = await setupLiveCampaign({ rewardPerCompletion, maxCompletions });

    const opp = await prisma.opportunity.findFirst({ where: { campaignId: campaign.id } });

    // Two viewers with open sessions.
    const viewerA = await createUser();
    const viewerB = await createUser();
    const sessionA = await startWatchSession({ userId: viewerA.id, opportunityId: opp!.id });
    const sessionB = await startWatchSession({ userId: viewerB.id, opportunityId: opp!.id });
    const backdate = new Date(Date.now() - 20_000);
    await prisma.watchSession.updateMany({ where: { id: sessionA.id }, data: { startedAt: backdate } });
    await prisma.watchSession.updateMany({ where: { id: sessionB.id }, data: { startedAt: backdate } });

    // Drain the remaining budget so exactly one reward is left.
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { remainingBudget: rewardPerCompletion },
    });

    const { reward: firstReward } = await completeWatchSession({ userId: viewerA.id, watchSessionId: sessionA.id });
    expect(firstReward.amount).toBe(rewardPerCompletion);

    const campaignMid = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(campaignMid!.remainingBudget).toBe(0);
    expect(campaignMid!.currentCompletions).toBe(1);

    // The second completion fails and must roll back the opportunity capacity bump.
    await expect(
      completeWatchSession({ userId: viewerB.id, watchSessionId: sessionB.id }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_UNAVAILABLE" });

    const campaignAfter = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(campaignAfter!.currentCompletions).toBe(1);
    expect(campaignAfter!.completedViews).toBe(1);
    expect(campaignAfter!.spentAmount).toBe(rewardPerCompletion);

    const oppAfter = await prisma.opportunity.findUnique({ where: { id: opp!.id } });
    expect(oppAfter!.currentCompletions).toBe(1);

    const viewerBRewards = await prisma.reward.count({ where: { userId: viewerB.id } });
    expect(viewerBRewards).toBe(0);

    // Feed rejects new sessions while the campaign is dry.
    const viewerC = await createUser();
    await expect(startWatchSession({ userId: viewerC.id, opportunityId: opp!.id })).rejects.toMatchObject({
      code: "OPPORTUNITY_UNAVAILABLE",
    });

    await releaseEligiblePendingRewards();
    const walletA = await prisma.wallet.findUnique({ where: { userId: viewerA.id } });
    expect(walletA!.availableBalance).toBe(rewardPerCompletion);
    expect(budget).toBeGreaterThan(0);
  });

  it("cancel refunds the unused budget and stops the feed", async () => {
    const { owner, advertiser, campaign } = await setupLiveCampaign();

    const walletBefore = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(walletBefore!.availableBalance).toBe(0);

    await cancelCampaign(owner.id, campaign.id);

    const campaignAfter = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(campaignAfter!.status).toBe("CANCELLED");
    expect(campaignAfter!.remainingBudget).toBe(0);

    const walletAfter = await prisma.advertiserWallet.findUnique({ where: { advertiserId: advertiser.id } });
    expect(walletAfter!.availableBalance).toBe(campaign.budget);

    const opp = await prisma.opportunity.findFirst({ where: { campaignId: campaign.id } });
    expect(opp!.status).toBe("PAUSED");
    await expect(getEligibleOpportunity(opp!.id)).rejects.toBeTruthy();
  });
});