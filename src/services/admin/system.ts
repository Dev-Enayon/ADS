import "server-only";

import { prisma } from "@/lib/db";
import { env, isProd } from "@/lib/env";

/**
 * Lightweight platform health/readiness probe. Does not throw; it reports a
 * status string so the admin console (or an external load balancer) can react
 * instead of relying on an exception.
 */
export async function getSystemHealth() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const [counts] = await Promise.all([
    Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.advertiserProfile.count().catch(() => 0),
      prisma.campaign.count().catch(() => 0),
      prisma.withdrawal.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }).catch(() => 0),
      prisma.webhookEvent.count({ where: { status: "FAILED" } }).catch(() => 0),
      prisma.riskEvent.count({ where: { resolved: false } }).catch(() => 0),
    ]),
  ]);

  const pendingPayouts = counts[3];
  const failedWebhooks = counts[4];

  return {
    status: dbOk ? "ok" : "degraded",
    db: dbOk,
    counts: {
      users: counts[0],
      advertisers: counts[1],
      campaigns: counts[2],
      pendingPayouts,
      failedWebhooks,
      unresolvedRisk: counts[5],
    },
    runtime: {
      environment: isProd ? "production" : env.nodeEnv || "development",
      appUrl: env.appUrl,
      paymentProvider: env.paymentProvider,
      payoutProvider: env.payoutProvider,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function getWebhookFailures(limit = 25) {
  return prisma.webhookEvent.findMany({
    where: { status: "FAILED" },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
}