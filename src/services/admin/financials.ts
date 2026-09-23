import "server-only";

import { prisma } from "@/lib/db";

/**
 * Read-only financial rollups for the admin console. Every number comes from
 * an aggregate over the ledger/wallets so a single source of truth is always
 * what shows up here; there are no cached or denormalized counters.
 */
export async function getFinancialSummary() {
  const [userWallet, advertiserWallet, counts, recentLedger] = await Promise.all([
    prisma.wallet.aggregate({
      _sum: {
        availableBalance: true,
        pendingBalance: true,
        totalEarned: true,
        totalWithdrawn: true,
      },
    }),
    prisma.advertiserWallet.aggregate({
      _sum: { availableBalance: true, totalFunded: true, totalAllocated: true, totalSpent: true },
    }),
    Promise.all([
      prisma.user.count(),
      prisma.advertiserProfile.count(),
      prisma.campaign.count(),
      prisma.reward.count({ where: { status: "PENDING" } }),
      prisma.withdrawal.count(),
      prisma.withdrawal.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.riskEvent.count({ where: { resolved: false } }),
    ]),
    prisma.ledgerTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { email: true } } },
    }),
  ]);

  return {
    walletTotals: {
      availableBalance: userWallet._sum.availableBalance ?? 0,
      pendingBalance: userWallet._sum.pendingBalance ?? 0,
      totalEarned: userWallet._sum.totalEarned ?? 0,
      totalWithdrawn: userWallet._sum.totalWithdrawn ?? 0,
    },
    advertiserTotals: {
      availableBalance: advertiserWallet._sum.availableBalance ?? 0,
      totalFunded: advertiserWallet._sum.totalFunded ?? 0,
      totalAllocated: advertiserWallet._sum.totalAllocated ?? 0,
      totalSpent: advertiserWallet._sum.totalSpent ?? 0,
    },
    counts: {
      users: counts[0],
      advertisers: counts[1],
      campaigns: counts[2],
      pendingRewards: counts[3],
      withdrawals: counts[4],
      inFlightWithdrawals: counts[5],
      unresolvedRisk: counts[6],
    },
    recentLedger,
  };
}

export async function listLedgerActivity(userId?: string, limit = 50) {
  const take = Math.min(Math.max(limit, 1), 200);
  return prisma.ledgerTransaction.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { email: true } } },
  });
}