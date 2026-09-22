/**
 * Dev seed for RewardHub Part 1.
 *
 * - Idempotent enough to re-run in development.
 * - Creates: platform settings, DEV-marked sponsored opportunities
 *   (sample Google-hosted videos), and a verified demo account with a
 *   ZERO balance (no fake money anywhere).
 *
 * Advertiser-driven opportunities replace the DEV ones in Part 2.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdvertiserStatus,
  CampaignStatus,
  OpportunitySource,
  TeamRole,
  UserStatus,
} from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RH";
  for (let i = 0; i < 8; i++) {
    code += alphabet.charAt(randomInt(alphabet.length));
  }
  return code;
}

const SETTINGS: Array<{ key: string; value: string; description: string }> = [
  { key: "MINIMUM_WITHDRAWAL", value: "50000", description: "Minimum withdrawal (kobo)" },
  { key: "MAXIMUM_WITHDRAWAL", value: "0", description: "Maximum withdrawal per request (0 = none)" },
  { key: "DAILY_WITHDRAWAL_LIMIT", value: "0", description: "Daily withdrawal limit (0 = none)" },
  { key: "WITHDRAWAL_FEE_RATE", value: "0", description: "Withdrawal fee rate (%)" },
  { key: "REFERRAL_REWARD_AMOUNT", value: "2000", description: "Referral reward (kobo)" },
  { key: "REWARD_VALIDATION_DELAY_SECONDS", value: "0", description: "Reward validation delay (s)" },
  { key: "MAX_ACTIVE_WATCH_SESSIONS", value: "3", description: "Max active watch sessions" },
  { key: "CAMPAIGN_MIN_VIDEO_SECONDS", value: "8", description: "Min sponsored video length (s)" },
  { key: "CAMPAIGN_MAX_VIDEO_SECONDS", value: "120", description: "Max sponsored video length (s)" },
  { key: "CAMPAIGN_MIN_REWARD", value: "100", description: "Min reward per campaign completion (kobo)" },
  { key: "CAMPAIGN_MAX_REWARD", value: "20000", description: "Max reward per campaign completion (kobo)" },
  { key: "CAMPAIGN_MIN_COMPLETIONS", value: "50", description: "Min campaign completions" },
  { key: "CAMPAIGN_MAX_COMPLETIONS", value: "1000000", description: "Max campaign completions" },
  { key: "CAMPAIGN_FEE_RATE", value: "0", description: "Advertiser platform fee rate (%)" },
  { key: "ADVERTISER_REVIEW_MODE", value: "auto", description: "Submission review mode: auto (dev) or hold (prod)" },
];

// Google-hosted sample videos (public, stable) used ONLY in dev seed data.
const OPPORTUNITIES = [
  {
    id: "seed-15-5000",
    title: "Discover Chromebook basics",
    description:
      "A quick, friendly tour of Google Chromebook essentials. Watch the full video to earn.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    thumbnailUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg",
    durationSeconds: 15,
    rewardAmount: 5000, // ₦50.00
    isFeatured: false,
  },
  {
    id: "seed-15-4000",
    title: "Life on Chrome",
    description:
      "An upbeat short about everyday moments with Chrome. Complete the watch to earn.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    thumbnailUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg",
    durationSeconds: 15,
    rewardAmount: 4000, // ₦40.00
    isFeatured: false,
  },
  {
    id: "seed-60-10000",
    title: "A day with Google Home",
    description:
      "A cozy look at a day with Google Home. Finish the video to collect your reward.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    thumbnailUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg",
    durationSeconds: 60,
    rewardAmount: 10000, // ₦100.00
    isFeatured: true,
  },
  {
    id: "seed-15-4500",
    title: "Sound in the mix",
    description:
      "A sample audio-visual for warmer sound. Watch through to the end to earn.",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    thumbnailUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg",
    durationSeconds: 15,
    rewardAmount: 4500, // ₦45.00
    isFeatured: false,
  },
];

async function main() {
  console.log("Seeding RewardHub (dev)…");

  for (const s of SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value, description: s.description },
    });
  }
  console.log(`Settings: ${SETTINGS.length} ensured.`);

  for (const o of OPPORTUNITIES) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        title: o.title,
        description: o.description,
        videoUrl: o.videoUrl,
        thumbnailUrl: o.thumbnailUrl,
        durationSeconds: o.durationSeconds,
        rewardAmount: o.rewardAmount,
        source: OpportunitySource.DEV,
        status: "ACTIVE",
        isFeatured: o.isFeatured,
      },
    });
  }
  console.log(`Opportunities: ${OPPORTUNITIES.length} DEV items ensured.`);

  const demoEmail = "demo@rewardhub.dev";
  const demoPassword = "rewardhub-demo";
  const existing = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (existing) {
    console.log("Demo account already exists; skipping.");
  } else {
    await prisma.user.create({
      data: {
        email: demoEmail,
        passwordHash: await hashPassword(demoPassword),
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        referralCode: generateReferralCode(),
        profile: { create: { fullName: "Demo User" } },
        wallet: { create: {} }, // zero balance by design
      },
    });
    console.log(`Demo account created: ${demoEmail} / ${demoPassword} (zero balance).`);
  }

  // --- Advertiser demo (Part 2) -------------------------------------------
  // Clearly DEMO, zero funding. No fake money, no fake payment records.
  const advEmail = "advertiser@rewardhub.dev";
  const advPassword = "rewardhub-advertiser";
  const advUser = await prisma.user.findUnique({ where: { email: advEmail } });
  const advUserId = advUser
    ? advUser.id
    : (
        await prisma.user.create({
          data: {
            email: advEmail,
            passwordHash: await hashPassword(advPassword),
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            referralCode: generateReferralCode(),
            profile: { create: { fullName: "Demo Advertiser" } },
            wallet: { create: {} },
          },
        })
      ).id;
  if (!advUser) {
    console.log(`Advertiser demo account created: ${advEmail} / ${advPassword} (zero balance).`);
  }

  const demoAdvertiserId = "seed-advertiser-demo";
  const advertiser = await prisma.advertiserProfile.upsert({
    where: { id: demoAdvertiserId },
    update: {},
    create: {
      id: demoAdvertiserId,
userId: advUserId,
      businessName: "Demo Foods (DEV)",
      businessDescription:
        "Development-only demonstration advertiser. No real funds, no real campaigns.",
      businessEmail: advEmail,
      category: "Food & Beverage",
      country: "NG",
      status: AdvertiserStatus.ACTIVE,
    },
  });
  await prisma.advertiserWallet.upsert({
    where: { advertiserId: advertiser.id },
    update: {},
    create: { advertiserId: advertiser.id },
  });
  await prisma.advertiserMember.upsert({
    where: { advertiserId_userId: { advertiserId: advertiser.id, userId: advUserId } },
    update: { role: TeamRole.OWNER },
    create: { advertiserId: advertiser.id, userId: advUserId, role: TeamRole.OWNER },
  });
  await prisma.campaign.upsert({
    where: { id: "seed-campaign-demo" },
    update: {},
    create: {
      id: "seed-campaign-demo",
      advertiserId: advertiser.id,
      name: "Demo launch: Clean kitchens (DEV)",
      description:
        "Development-only campaign. Not live and never funded — shows the creation flow only.",
      objective: "PRODUCT_LAUNCH",
      status: CampaignStatus.DRAFT,
      rewardPerCompletion: 5000,
      maxCompletions: 500,
      budget: 2_500_000, // 5000 * 500 — planned only, NOT allocated
      allocatedAmount: 0,
      spentAmount: 0,
      remainingBudget: 0,
      createdBy: advUserId,
    },
  });
  console.log(`Advertiser demo ensured: ${advertiser.businessName} (zero funds, DRAFT campaign).`);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });