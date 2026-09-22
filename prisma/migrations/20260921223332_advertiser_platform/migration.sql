-- CreateEnum
CREATE TYPE "AdvertiserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'MANAGER', 'ANALYST');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignObjective" AS ENUM ('BRAND_AWARENESS', 'PRODUCT_LAUNCH', 'APP_INSTALL', 'LEAD_GENERATION', 'SALES_PROMOTION', 'ENGAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentProviderCode" AS ENUM ('DEV_MOCK', 'PAYSTACK', 'FLUTTERWAVE', 'MANUAL');

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('INITIALIZED', 'PENDING_VERIFICATION', 'COMPLETED', 'FAILED', 'REFUNDED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_PAUSED';
ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'LOW_BUDGET';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_FAILED';

-- CreateTable
CREATE TABLE "AdvertiserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessDescription" TEXT,
    "businessEmail" TEXT NOT NULL,
    "businessPhone" TEXT,
    "website" TEXT,
    "category" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "logoUrl" TEXT,
    "status" "AdvertiserStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvertiserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertiserMember" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'ANALYST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertiserMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" "CampaignObjective" NOT NULL DEFAULT 'BRAND_AWARENESS',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "rewardPerCompletion" INTEGER NOT NULL,
    "maxCompletions" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "allocatedAmount" INTEGER NOT NULL DEFAULT 0,
    "spentAmount" INTEGER NOT NULL DEFAULT 0,
    "currentCompletions" INTEGER NOT NULL DEFAULT 0,
    "startedViews" INTEGER NOT NULL DEFAULT 0,
    "completedViews" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targeting" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "CreativeType" NOT NULL DEFAULT 'VIDEO',
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ctaText" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "meta" JSONB,
    "status" "CreativeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertiserWallet" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "availableBalance" INTEGER NOT NULL DEFAULT 0,
    "totalFunded" INTEGER NOT NULL DEFAULT 0,
    "totalAllocated" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvertiserWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertiserLedgerTransaction" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "campaignId" TEXT,
    "fundingId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertiserLedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignFunding" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "campaignId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "FundingStatus" NOT NULL DEFAULT 'INITIALIZED',
    "provider" "PaymentProviderCode" NOT NULL DEFAULT 'DEV_MOCK',
    "providerRef" TEXT,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "meta" JSONB,
    "failureReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignFunding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdvertiserProfile_userId_key" ON "AdvertiserProfile"("userId");

-- CreateIndex
CREATE INDEX "AdvertiserProfile_status_idx" ON "AdvertiserProfile"("status");

-- CreateIndex
CREATE INDEX "AdvertiserMember_userId_idx" ON "AdvertiserMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertiserMember_advertiserId_userId_key" ON "AdvertiserMember"("advertiserId", "userId");

-- CreateIndex
CREATE INDEX "Campaign_advertiserId_status_idx" ON "Campaign"("advertiserId", "status");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_advertiserId_idx" ON "Campaign"("advertiserId");

-- CreateIndex
CREATE INDEX "Creative_campaignId_idx" ON "Creative"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertiserWallet_advertiserId_key" ON "AdvertiserWallet"("advertiserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertiserLedgerTransaction_reference_key" ON "AdvertiserLedgerTransaction"("reference");

-- CreateIndex
CREATE INDEX "AdvertiserLedgerTransaction_advertiserId_createdAt_idx" ON "AdvertiserLedgerTransaction"("advertiserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdvertiserLedgerTransaction_campaignId_idx" ON "AdvertiserLedgerTransaction"("campaignId");

-- CreateIndex
CREATE INDEX "AdvertiserLedgerTransaction_fundingId_idx" ON "AdvertiserLedgerTransaction"("fundingId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignFunding_reference_key" ON "CampaignFunding"("reference");

-- CreateIndex
CREATE INDEX "CampaignFunding_advertiserId_createdAt_idx" ON "CampaignFunding"("advertiserId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignFunding_campaignId_idx" ON "CampaignFunding"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignFunding_reference_idx" ON "CampaignFunding"("reference");

-- CreateIndex
CREATE INDEX "Opportunity_campaignId_idx" ON "Opportunity"("campaignId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserProfile" ADD CONSTRAINT "AdvertiserProfile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserProfile" ADD CONSTRAINT "AdvertiserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserMember" ADD CONSTRAINT "AdvertiserMember_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserMember" ADD CONSTRAINT "AdvertiserMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserWallet" ADD CONSTRAINT "AdvertiserWallet_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserLedgerTransaction" ADD CONSTRAINT "AdvertiserLedgerTransaction_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserLedgerTransaction" ADD CONSTRAINT "AdvertiserLedgerTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "AdvertiserWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignFunding" ADD CONSTRAINT "CampaignFunding_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignFunding" ADD CONSTRAINT "CampaignFunding_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
