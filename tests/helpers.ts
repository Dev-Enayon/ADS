/**
 * Shared helpers for integration tests. Everything runs against the
 * rewardhub_test database (see vitest.config.ts `test.env`).
 */

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "../src/lib/db";
import { OpportunitySource, OpportunityStatus, OpportunityType, UserStatus } from "../src/generated/prisma/enums";

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