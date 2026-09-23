-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = 'WebhookEventStatus') THEN
    CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'IGNORED', 'FAILED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t WHERE t.typname = 'RiskEventType') THEN
    CREATE TYPE "RiskEventType" AS ENUM ('SESSION_TAMPERING', 'HEARTBEAT_ANOMALY', 'DEVICE_IP_MISMATCH', 'RAPID_CONSUMPTION', 'WITHDRAWAL_ABUSE', 'SUSPICIOUS_REFERRAL', 'ACCOUNT_FLAG', 'SYSTEM');
  END IF;
END $$;

-- AlterEnum
-- Each ADD VALUE is guarded so both fresh databases and databases that were
-- partially migrated on an earlier (corrected) attempt end up in the same
-- state. PostgreSQL 18 supports ALTER TYPE ... ADD VALUE in a DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'CAMPAIGN_DELETED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_DELETED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'CAMPAIGN_RESUMED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_RESUMED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'CREATIVE_REJECTED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'CREATIVE_REJECTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'PAYMENT_REFUNDED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REFUNDED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'PAYOUT_SUCCEEDED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_SUCCEEDED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'PAYOUT_FAILED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_FAILED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'HIGH_RISK_FLAG') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'HIGH_RISK_FLAG';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'ACCOUNT_SUSPENDED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_SUSPENDED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'ACCOUNT_REACTIVATED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_REACTIVATED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'ADVERTISER_APPROVED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'ADVERTISER_APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'ADVERTISER_REJECTED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'ADVERTISER_REJECTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'ADVERTISER_SUSPENDED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'ADVERTISER_SUSPENDED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e WHERE e.enumtypid = '"NotificationType"'::regtype AND e.enumlabel = 'ADVERTISER_REACTIVATED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'ADVERTISER_REACTIVATED';
  END IF;
END $$;

-- AlterTable
-- Preserve existing TEXT values by casting in place (no drop/recreate).
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" SET DATA TYPE "UserRole" USING ("role"::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN     "payoutAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processedById" TEXT,
ADD COLUMN     "provider" "PaymentProviderCode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "providerStatus" TEXT;

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "externalRef" TEXT,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RiskEventType" NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "meta" JSONB,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_entityType_entityId_idx" ON "WebhookEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "RiskEvent_userId_createdAt_idx" ON "RiskEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskEvent_type_idx" ON "RiskEvent"("type");

-- CreateIndex
CREATE INDEX "RiskEvent_resolved_idx" ON "RiskEvent"("resolved");

-- CreateIndex
CREATE INDEX "Withdrawal_provider_providerRef_idx" ON "Withdrawal"("provider", "providerRef");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;