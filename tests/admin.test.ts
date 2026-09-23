import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import { hashToken } from "../src/lib/security/password";
import { UserStatus, UserRole } from "../src/generated/prisma/enums";
import { createAdmin, createAdvertiser, createCampaignForAdmin, createUser, fundUser } from "./helpers";

import {
  listUsers,
  getUserDetail,
  suspendUser,
  reactivateUser,
  setUserRole,
} from "../src/services/admin/users";
import {
  listAdvertisers,
  getAdvertiserDetail,
  approveAdvertiser,
  rejectAdvertiser,
  suspendAdvertiser,
  reactivateAdvertiser,
} from "../src/services/admin/advertisers";
import {
  listCampaigns,
  getCampaignDetail,
  moderateCampaign,
  pauseCampaignAdmin,
  resumeCampaignAdmin,
} from "../src/services/admin/campaigns";
import {
  listWithdrawals,
  getWithdrawalDetail,
  settleWithdrawalManually,
  failWithdrawalAdmin,
  reverseWithdrawalAdmin,
  dispatchWithdrawal,
} from "../src/services/admin/withdrawals";
import { listSettings, updateSetting } from "../src/services/admin/settings";
import { getFinancialSummary, listLedgerActivity } from "../src/services/admin/financials";
import { getSystemHealth, getWebhookFailures } from "../src/services/admin/system";
import { cancelCampaign, deleteDraftCampaign } from "../src/services/campaigns";
import { allocateToCampaign } from "../src/services/funding";
import { createWithdrawal } from "../src/services/withdrawals";
import { getIntSetting, invalidateSettingsCache } from "../src/lib/settings";

const BANK_DETAILS = { accountName: "Ada", accountNumber: "0123456789", bankName: "Test Bank" };

async function makeWithdrawal(userId: string, amount = 100000) {
  await fundUser(userId, amount);
  return createWithdrawal({
    userId,
    amount,
    paymentMethod: "BANK_TRANSFER",
    paymentDetails: BANK_DETAILS,
  });
}

describe("admin: users", () => {
  it("lists users with pagination, status and role filters", async () => {
    await createUser({ email: "plain@test.dev", verified: true });
    const suspended = await createUser({ email: "gone@test.dev", verified: true });
    await createAdmin({ email: "ops@test.dev" });

    const all = await listUsers({ page: 1, pageSize: 10 });
    expect(all.total).toBe(3);
    expect(all.pages).toBe(1);

    const paged = await listUsers({ page: 1, pageSize: 2 });
    expect(paged.total).toBe(3);
    expect(paged.rows).toHaveLength(2);
    expect(paged.pages).toBe(2);

    const adminsOnly = await listUsers({ role: UserRole.ADMIN });
    expect(adminsOnly.total).toBe(1);
    expect(adminsOnly.rows[0].email).toBe("ops@test.dev");

    await prisma.user.update({
      where: { id: suspended.id },
      data: { status: UserStatus.SUSPENDED },
    });
    const onlySuspended = await listUsers({ status: UserStatus.SUSPENDED });
    expect(onlySuspended.total).toBe(1);
    expect(onlySuspended.rows[0].email).toBe("gone@test.dev");

    const searched = await listUsers({ search: "plain@" });
    expect(searched.total).toBe(1);
  });

  it("suspends a user, kills their sessions and notifies them", async () => {
    const actor = await createAdmin();
    const target = await createUser({ email: "target@test.dev", verified: true });

    await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: hashToken("session-token-1"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await suspendUser({
      userId: target.id,
      actorId: actor.id,
      reason: "Terms violation.",
      ip: "127.0.0.1",
    });

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      include: { sessions: true },
    });
    expect(row.status).toBe(UserStatus.SUSPENDED);
    expect(row.sessions.every((s) => s.revokedAt !== null)).toBe(true);
    await expect(
      prisma.notification.count({ where: { userId: target.id, type: "ACCOUNT_SUSPENDED" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { action: "USER.ADMIN_SUSPENDED", entityId: target.id } }),
    ).resolves.toBe(1);

    await reactivateUser({ userId: target.id, actorId: actor.id, reason: "Appeal accepted." });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      UserStatus.ACTIVE,
    );
    // Reactivating an already-active account conflicts.
    await expect(
      reactivateUser({ userId: target.id, actorId: actor.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("changes roles but forbids a self-demotion", async () => {
    const superAdmin = await createAdmin({ super: true });
    const target = await createUser({ email: "promotee@test.dev", verified: true });

    const updated = await setUserRole({
      userId: target.id,
      actorId: superAdmin.id,
      role: UserRole.ADMIN,
    });
    expect(updated.role).toBe(UserRole.ADMIN);
    await expect(
      setUserRole({ userId: target.id, actorId: superAdmin.id, role: UserRole.SUPER_ADMIN }),
    ).resolves.toMatchObject({ role: UserRole.SUPER_ADMIN });

    await expect(
      setUserRole({ userId: superAdmin.id, actorId: superAdmin.id, role: UserRole.USER }),
    ).rejects.toMatchObject({ code: "SELF_DEMOTE" });
  });

  it("returns a full member detail snapshot", async () => {
    const user = await createUser({ email: "detail@test.dev", verified: true });
    const detail = await getUserDetail(user.id);
    expect(detail.email).toBe("detail@test.dev");
    expect(detail.wallet).not.toBeNull();
    expect(detail.riskEvents).toEqual([]);
    await expect(getUserDetail("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("admin: advertisers", () => {
  it("lists advertisers and runs the review transitions", async () => {
    const admin = await createAdmin();
    const { advertiser } = await createAdvertiser({ status: "PENDING" });

    const page = await listAdvertisers({ page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.rows[0].id).toBe(advertiser.id);

    await approveAdvertiser({ advertiserId: advertiser.id, actorId: admin.id });
    let detail = await getAdvertiserDetail(advertiser.id);
    expect(detail.status).toBe("ACTIVE");
    expect(detail.reviewedAt).not.toBeNull();
    expect(detail.reviewedBy?.id).toBe(admin.id);

    await suspendAdvertiser({
      advertiserId: advertiser.id,
      actorId: admin.id,
      note: "Payment issue.",
    });
    detail = await getAdvertiserDetail(advertiser.id);
    expect(detail.status).toBe("SUSPENDED");
    expect(detail.rejectionReason).toBe("Payment issue.");

    await reactivateAdvertiser({ advertiserId: advertiser.id, actorId: admin.id });
    detail = await getAdvertiserDetail(advertiser.id);
    expect(detail.status).toBe("ACTIVE");

    await expect(
      reactivateAdvertiser({ advertiserId: advertiser.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects a pending advertiser and records the reason", async () => {
    const admin = await createAdmin();
    const { advertiser } = await createAdvertiser({ status: "PENDING" });

    await rejectAdvertiser({
      advertiserId: advertiser.id,
      actorId: admin.id,
      note: "Missing verification documents.",
    });

    const detail = await getAdvertiserDetail(advertiser.id);
    expect(detail.status).toBe("REJECTED");
    expect(detail.rejectionReason).toBe("Missing verification documents.");
    expect(detail.reviewedAt).not.toBeNull();
  });

  it("pauses active campaigns when an advertiser is suspended", async () => {
    const admin = await createAdmin();
    const { owner, advertiser } = await createAdvertiser({ status: "ACTIVE" });
    const campaign = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "ACTIVE",
    });

    await suspendAdvertiser({
      advertiserId: advertiser.id,
      actorId: admin.id,
      note: "Fraud review.",
    });

    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(after.status).toBe("PAUSED");
  });
});

describe("admin: campaigns", () => {
  it("lists campaigns and rejects one awaiting review", async () => {
    const admin = await createAdmin();
    const { owner, advertiser } = await createAdvertiser({ status: "ACTIVE" });
    const campaign = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "PENDING_REVIEW",
    });

    const page = await listCampaigns({ page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.rows[0].id).toBe(campaign.id);

    await moderateCampaign({
      campaignId: campaign.id,
      action: "reject",
      actorId: admin.id,
      reason: "Creative guidelines not met.",
      ip: "127.0.0.1",
    });

    const detail = await getCampaignDetail(campaign.id);
    expect(detail.status).toBe("REJECTED");
    expect(detail.rejectionReason).toBe("Creative guidelines not met.");
    expect(detail.reviewedBy?.id).toBe(admin.id);
  });

  it("pauses and resumes a live campaign as an operator", async () => {
    const admin = await createAdmin();
    const { owner, advertiser } = await createAdvertiser({ status: "ACTIVE" });
    const campaign = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "ACTIVE",
      rewardPerCompletion: 5000,
      maxCompletions: 100,
      allocatedAmount: 500000,
    });

    await pauseCampaignAdmin({ campaignId: campaign.id, actorId: admin.id, reason: "Breakeven check." });
    expect((await getCampaignDetail(campaign.id)).status).toBe("PAUSED");

    await resumeCampaignAdmin({ campaignId: campaign.id, actorId: admin.id });
    expect((await getCampaignDetail(campaign.id)).status).toBe("ACTIVE");

    // Not pausable once more after resume is fine; pausing a DRAFT conflicts.
    const draft = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "DRAFT",
    });
    await expect(
      pauseCampaignAdmin({ campaignId: draft.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("approves a campaign awaiting review and refuses a second approval", async () => {
    const admin = await createAdmin();
    const { owner, advertiser } = await createAdvertiser({ status: "ACTIVE" });
    const campaign = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "PENDING_REVIEW",
    });

    await moderateCampaign({
      campaignId: campaign.id,
      action: "approve",
      actorId: admin.id,
      ip: "127.0.0.1",
    });

    const detail = await getCampaignDetail(campaign.id);
    expect(detail.status).toBe("ACTIVE");
    expect(detail.reviewedAt).not.toBeNull();
    expect(detail.reviewedBy?.id).toBe(admin.id);

    await expect(
      moderateCampaign({ campaignId: campaign.id, action: "approve", actorId: admin.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("deletes a fund-free draft outright", async () => {
    const { owner, advertiser } = await createAdvertiser({ status: "ACTIVE" });
    const draft = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "DRAFT",
      allocatedAmount: 0,
    });

    await deleteDraftCampaign(owner.id, draft.id);
    await expect(prisma.campaign.findUnique({ where: { id: draft.id } })).resolves.toBeNull();
  });

  it("cancels a funded campaign and refunds the remaining budget (delete-and-refund)", async () => {
    const { owner, advertiser } = await createAdvertiser({ status: "ACTIVE" });
    const campaign = await createCampaignForAdmin({
      advertiserId: advertiser.id,
      createdBy: owner.id,
      status: "DRAFT",
      rewardPerCompletion: 5000,
      maxCompletions: 100,
      allocatedAmount: 0,
    });

    // Move real money into the campaign so there is something to refund.
    await prisma.advertiserWallet.update({
      where: { advertiserId: advertiser.id },
      data: { availableBalance: 500000, totalFunded: 500000 },
    });
    await allocateToCampaign(owner.id, campaign.id, 500000);

    await cancelCampaign(owner.id, campaign.id);

    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.remainingBudget).toBe(0);

    const wallet = await prisma.advertiserWallet.findUniqueOrThrow({
      where: { advertiserId: advertiser.id },
    });
    expect(wallet.availableBalance).toBe(500000);
    expect(wallet.totalAllocated).toBe(0);

    const refund = await prisma.advertiserLedgerTransaction.findFirstOrThrow({
      where: { campaignId: campaign.id, type: "REFUND" },
    });
    expect(refund.amount).toBe(500000);
    expect(refund.direction).toBe("CREDIT");
  });
});

describe("admin: withdrawals", () => {
  it("lists withdrawals for members and resolves a detail view", async () => {
    const user = await createUser({ email: "payer@test.dev", verified: true });
    const created = await makeWithdrawal(user.id);

    const page = await listWithdrawals({ page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.rows[0].user.email).toBe("payer@test.dev");

    const detail = await getWithdrawalDetail(created.id);
    expect(detail.user.wallet).not.toBeNull();
    await expect(getWithdrawalDetail("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dispatches, settles and reverses through the admin console", async () => {
    const admin = await createAdmin();
    const user = await createUser({ verified: true });
    const created = await makeWithdrawal(user.id);

    const dispatched = await dispatchWithdrawal({ withdrawalId: created.id, actorId: admin.id });
    expect(dispatched.status).toBe("PROCESSING");

    const settled = await settleWithdrawalManually({
      withdrawalId: created.id,
      actorId: admin.id,
      providerRef: "BANK-REF-99",
      ip: "127.0.0.1",
    });
    expect(settled.providerRef).toBe("BANK-REF-99");

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("SUCCESS");
    expect(row.providerRef).toBe("BANK-REF-99");
    expect(row.processedById).toBe(admin.id);
    const walletAfterPay = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(walletAfterPay.totalWithdrawn).toBe(created.amount);

    await reverseWithdrawalAdmin({
      withdrawalId: created.id,
      actorId: admin.id,
      reason: "Wrong account.",
    });
    const reversed = await prisma.withdrawal.findUniqueOrThrow({ where: { id: created.id } });
    expect(reversed.status).toBe("REVERSED");
    const walletReversed = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(walletReversed.totalWithdrawn).toBe(0);
    expect(walletReversed.availableBalance).toBe(created.amount);
  });

  it("settles a fresh PENDING withdrawal and refuses an invalid-state settle", async () => {
    const admin = await createAdmin();
    const user = await createUser({ verified: true });
    const created = await makeWithdrawal(user.id);

    const settled = await settleWithdrawalManually({ withdrawalId: created.id, actorId: admin.id });
    expect(settled.providerRef).toMatch(/^MANUAL-/);

    await expect(
      settleWithdrawalManually({ withdrawalId: created.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("marks a payout failed and returns the funds", async () => {
    const admin = await createAdmin();
    const user = await createUser({ verified: true });
    const created = await makeWithdrawal(user.id);

    await failWithdrawalAdmin({
      withdrawalId: created.id,
      actorId: admin.id,
      reason: "Bank account closed.",
    });

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("FAILED");
    expect(row.failureReason).toBe("Bank account closed.");
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableBalance).toBe(created.amount);
  });
});

describe("admin: settings, financials & system", () => {
  it("lists the settings catalog and updates a validated value", async () => {
    const admin = await createAdmin();

    const before = await listSettings();
    expect(before.length).toBeGreaterThan(10);
    const withdrawalsSwitch = before.find((s) => s.key === "ENABLE_WITHDRAWALS");
    expect(withdrawalsSwitch).toBeDefined();
    expect(withdrawalsSwitch?.source).toBe("default");
    expect(withdrawalsSwitch?.value).toBe("true");

    // Unknown keys are rejected outright.
    await expect(
      updateSetting({ key: "NOT_A_REAL_SETTING", value: "1", actorId: admin.id }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    // Int settings reject non-numeric input.
    await expect(
      updateSetting({ key: "MINIMUM_WITHDRAWAL", value: "lots", actorId: admin.id }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Prime the runtime cache with the pre-write value so the update must
    // invalidate it for the next read to observe the new number.
    expect(await getIntSetting("MINIMUM_WITHDRAWAL", 50000)).toBe(50000);

    await updateSetting({
      key: "MINIMUM_WITHDRAWAL",
      value: "25000",
      actorId: admin.id,
      ip: "127.0.0.1",
    });
    expect(await getIntSetting("MINIMUM_WITHDRAWAL", 50000)).toBe(25000);

    const after = await listSettings();
    const changed = after.find((s) => s.key === "MINIMUM_WITHDRAWAL");
    expect(changed?.value).toBe("25000");
    expect(changed?.source).toBe("custom");
    await expect(
      prisma.auditLog.count({ where: { action: "ADMIN.SETTING_UPDATED" } }),
    ).resolves.toBe(1);

    // Leave the shared settings cache clean for later tests in this file.
    invalidateSettingsCache();
  });

  it("aggregates wallet totals and counts from the ledger", async () => {
    const user = await createUser({ verified: true });
    await fundUser(user.id, 150000);

    const summary = await getFinancialSummary();
    expect(summary.walletTotals.availableBalance).toBeGreaterThanOrEqual(150000);
    expect(summary.counts.users).toBeGreaterThanOrEqual(1);
    expect(summary.recentLedger.length).toBeGreaterThanOrEqual(1);

    const forUser = await listLedgerActivity(user.id, 5);
    expect(forUser.some((l) => l.userId === user.id)).toBe(true);
  });

  it("reports a healthy runtime probe", async () => {
    const health = await getSystemHealth();
    expect(health.status).toBe("ok");
    expect(health.db).toBe(true);
    expect(typeof health.runtime.payoutProvider).toBe("string");
    expect(typeof health.runtime.paymentProvider).toBe("string");
    expect(health.counts.users).toBeGreaterThanOrEqual(0);

    const failures = await getWebhookFailures();
    expect(Array.isArray(failures)).toBe(true);
  });
});
