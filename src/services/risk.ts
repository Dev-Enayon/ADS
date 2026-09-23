import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { NotificationType, RiskEventType, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { autoSuspensionOnHighRisk } from "@/lib/settings";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export type RecordRiskEventInput = {
  userId: string;
  type: RiskEventType;
  severity: RiskSeverity;
  description: string;
  meta?: Prisma.InputJsonObject;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Deterministic fraud/risk signal capture (Part 3).
 *
 * Every detection decision is a server-side insert, never a user-facing
 * error, so the fraud layer can never become a denial-of-service vector on its
 * own: a wrongly configured rule "flags" but never blocks. HIGH events surface
 * in the admin console and MAY auto-suspend the account via the
 * ACCOUNT_SUSPENSION_HIGH_RISK setting (off by default).
 */
export async function recordRiskEvent(
  input: RecordRiskEventInput,
): Promise<{ id: string; created: boolean }> {
  // Deduplicate repeated signals for the same (type, entity) while unresolved.
  const existing = await prisma.riskEvent.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      entityId: input.entityId ?? null,
      description: input.description,
      resolved: false,
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const event = await prisma.riskEvent.create({
    data: {
      userId: input.userId,
      type: input.type,
      severity: input.severity,
      description: input.description,
      meta: input.meta ?? undefined,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  if (input.severity === "HIGH") {
    try {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: NotificationType.HIGH_RISK_FLAG,
          title: "Account review",
          message:
            "Our safety systems flagged unusual activity on your account. Support will follow up if anything is needed.",
        },
      });
    } catch {
      // Notifications must never break the ledger or fraud pipeline.
    }

    if (await autoSuspensionOnHighRisk()) {
      await prisma.user.updateMany({
        where: { id: input.userId, status: { not: UserStatus.SUSPENDED } },
        data: { status: UserStatus.SUSPENDED },
      });
      try {
        await prisma.notification.create({
          data: {
            userId: input.userId,
            type: NotificationType.ACCOUNT_SUSPENDED,
            title: "Account suspended",
            message: "Your account was suspended pending review. Contact support for help.",
          },
        });
      } catch {
        // non-fatal
      }
    }
  }

  return { id: event.id, created: true };
}

/** Fire-and-forget wrapper so callers never handle a failed write. */
export function recordRiskEventSafe(input: RecordRiskEventInput): void {
  recordRiskEvent(input).catch(() => undefined);
}