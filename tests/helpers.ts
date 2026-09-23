/**
 * Shared helpers for integration tests. Everything runs against the
 * rewardhub_test database (see vitest.config.ts `test.env`).
 */

import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import {
  OpportunitySource,
  OpportunityStatus,
  OpportunityType,
  TeamRole,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/enums";

export const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function makeReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RH";
  for (let i = 0; i < 8; i++) code += alphabet.charAt(randomInt(alphabet.length));
  return code;
}

let userCounter = 0;

/** Creates a fully provisioned user (wallet + profile), verified by default. */
export async function createUser(opts: {
  email?: string;
  password?: string;
  verified?: boolean;
  status?: UserStatus;
} = {}) {
  const email = opts.email ?? `user-${++userCounter}@test.dev`;
  const passwordHash = await hashPassword(opts.password ?? "test-password-123");
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      status:
        opts.status ??
        (opts.verified === undefined || opts.verified
          ? UserStatus.ACTIVE
          : UserStatus.PENDING_VERIFICATION),
      emailVerifiedAt: opts.verified === undefined || opts.verified ? new Date() : null,
      referralCode: makeReferralCode(),
      profile: { create: { fullName: "Test User" } },
      wallet: { create: {} },
    },
    include: { profile: true, wallet: true },
  });
  return user;
}

let adminCounter = 0;

/** Creates an admin (or super admin) user with an active, verified account. */
export async function createAdmin(opts: {
  email?: string;
  password?: string;
  super?: boolean;
} = {}) {
  const email =
    opts.email ??
    `admin-${opts.super ? "super" : ""}${++adminCounter}@test.dev`;
  const user = await createUser({ email, password: opts.password, verified: true });
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: opts.super ? UserRole.SUPER_ADMIN : UserRole.ADMIN },
    include: { profile: true, wallet: true },
  });
  return updated;
}

let advertiserCounter = 0;

/** Creates an advertiser profile with its wallet and OWNER membership row. */
export async function createAdvertiser(opts: {
  businessName?: string;
  businessEmail?: string;
  status?: string;
  owner?: { id: string };
} = {}) {
  const owner = opts.owner ?? (await createUser({ verified: true }));
  const businessName = opts.businessName ?? `Test Brand ${++advertiserCounter}`;
  const advertiser = await prisma.advertiserProfile.create({
    data: {
      userId: owner.id,
      businessName,
      businessEmail: opts.businessEmail ?? `brand-${advertiserCounter}@test.dev`,
      status: (opts.status ?? "PENDING") as never,
    },
  });
  await prisma.advertiserWallet.create({ data: { advertiserId: advertiser.id } });
  await prisma.advertiserMember.create({
    data: { advertiserId: advertiser.id, userId: owner.id, role: TeamRole.OWNER },
  });
  return { owner, advertiser };
}

/** Credits an ACTIVE campaign row directly so admin moderation can be tested. */
export async function createCampaignForAdmin(opts: {
  advertiserId: string;
  createdBy: string;
  status?: string;
  rewardPerCompletion?: number;
  maxCompletions?: number;
  allocatedAmount?: number;
}) {
  const rewardPerCompletion = opts.rewardPerCompletion ?? 5000;
  const maxCompletions = opts.maxCompletions ?? 100;
  const allocatedAmount = opts.allocatedAmount ?? rewardPerCompletion * maxCompletions;
  return prisma.campaign.create({
    data: {
      advertiserId: opts.advertiserId,
      createdBy: opts.createdBy,
      name: `Admin test campaign ${++advertiserCounter}`,
      status: (opts.status ?? "DRAFT") as never,
      rewardPerCompletion,
      maxCompletions,
      budget: rewardPerCompletion * maxCompletions,
      allocatedAmount,
      remainingBudget: allocatedAmount,
    },
  });
}

/** Credits the user's available balance (counts as earnings), uniquely ref'd. */
export async function fundUser(userId: string, amount: number) {
  const { creditAvailable } = await import("../src/services/wallet");
  await creditAvailable(prisma, {
    userId,
    type: "REWARD",
    amount,
    description: "Test earnings",
    reference: `fund-${userId}-${amount}-${randomUUID()}`,
  });
}

let oppCounter = 0;

/** Creates an active DEV video opportunity. */
export async function createOpportunity(opts: {
  durationSeconds?: number;
  rewardAmount?: number;
  maxCompletions?: number | null;
  status?: OpportunityStatus;
} = {}) {
  const opp = await prisma.opportunity.create({
    data: {
      title: `Test opportunity ${++oppCounter}`,
      description: "Test sponsored video.",
      type: OpportunityType.VIDEO,
      videoUrl: "https://example.com/video.mp4",
      durationSeconds: opts.durationSeconds ?? 10,
      rewardAmount: opts.rewardAmount ?? 5000,
      status: opts.status ?? "ACTIVE",
      source: OpportunitySource.DEV,
      maxCompletions: opts.maxCompletions === undefined ? null : opts.maxCompletions,
    },
  });
  return opp;
}