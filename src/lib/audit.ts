import "server-only";

import { prisma } from "@/lib/db";

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
};

/** Persistent audit trail. Financial transitions are recorded here. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta as object | undefined,
        ipAddress: input.ip ?? null,
      },
    });
  } catch (error) {
    // Audit failures must never break the primary financial path.
    console.error("[audit] failed to write audit log", error);
  }
}