import "server-only";

import { RiskEventType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";

export type ListRiskEventsInput = {
  page?: number;
  pageSize?: number;
  resolved?: boolean;
  type?: RiskEventType;
  severity?: string;
};

export async function listRiskEvents(input: ListRiskEventsInput = {}) {
  const page = Math.max(input.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);

  const where = {
    ...(input.resolved !== undefined ? { resolved: input.resolved } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.severity ? { severity: input.severity } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.riskEvent.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, email: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    }),
    prisma.riskEvent.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getRiskEventDetail(riskEventId: string) {
  const event = await prisma.riskEvent.findUnique({
    where: { id: riskEventId },
    include: {
      user: { select: { id: true, email: true, status: true } },
      resolvedBy: { select: { id: true, email: true } },
    },
  });
  if (!event) throw Errors.notFound("Risk event not found.");
  return event;
}

export async function resolveRiskEvent(input: {
  riskEventId: string;
  actorId: string;
  resolution: string;
  ip?: string | null;
}) {
  const changed = await prisma.riskEvent.updateMany({
    where: { id: input.riskEventId, resolved: false },
    data: {
      resolved: true,
      resolvedById: input.actorId,
      resolvedAt: new Date(),
      resolution: input.resolution,
    },
  });
  if (changed.count !== 1) {
    throw Errors.conflict("Risk event is already resolved or does not exist.", "INVALID_STATE");
  }

  const event = await prisma.riskEvent.findUnique({ where: { id: input.riskEventId } });
  if (event) {
    await audit({
      userId: input.actorId,
      action: "RISK.RESOLVED",
      entityType: "RiskEvent",
      entityId: event.id,
      meta: { resolution: input.resolution },
      ip: input.ip,
    });
  }
  return { resolved: true };
}

export async function riskSummary() {
  const [unresolved, bySeverity, byType] = await Promise.all([
    prisma.riskEvent.count({ where: { resolved: false } }),
    prisma.riskEvent.groupBy({
      by: ["severity"],
      where: { resolved: false },
      _count: true,
    }),
    prisma.riskEvent.groupBy({
      by: ["type"],
      where: { resolved: true },
      _count: true,
    }),
  ]);
  return {
    unresolved,
    bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, r._count])),
    resolvedByType: Object.fromEntries(byType.map((r) => [r.type, r._count])),
  };
}