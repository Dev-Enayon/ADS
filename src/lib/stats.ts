import "server-only";

import { releaseEligiblePendingRewards } from "@/services/rewards";
import { getWallet } from "@/services/wallet";
import { prisma } from "@/lib/db";

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type DashboardStats = {
  availableBalance: number;
  pendingBalance: number;
  todayEarnings: number;
  totalEarned: number;
  totalWithdrawn: number;
  availableOpportunities: number;
  totalTransactions: number;
  unreadNotifications: number;
  accountStatus: string;
  emailVerified: boolean;
};

/**
 * Aggregated dashboard data. Runs the opportunistic PENDING->AVAILABLE
 * release so balances always reflect current state.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  await releaseEligiblePendingRewards();

  const [wallet, oppCount, txCount, unread, user] = await Promise.all([
    getWallet(userId),
    prisma.opportunity.count({
      where: {
        status: "ACTIVE",
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        AND: { OR: [{ startDate: null }, { startDate: { lte: new Date() } }] },
      },
    }),
    prisma.ledgerTransaction.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.user.findUnique({ where: { id: userId }, select: { status: true, emailVerifiedAt: true } }),
  ]);

  const today = await prisma.ledgerTransaction.aggregate({
    where: {
      userId,
      type: { in: ["REWARD", "REFERRAL_REWARD", "BONUS"] },
      direction: "CREDIT",
      createdAt: { gte: startOfDay() },
    },
    _sum: { amount: true },
  });

  return {
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    todayEarnings: today._sum.amount ?? 0,
    totalEarned: wallet.totalEarned,
    totalWithdrawn: wallet.totalWithdrawn,
    availableOpportunities: oppCount,
    totalTransactions: txCount,
    unreadNotifications: unread,
    accountStatus: user?.status ?? "UNKNOWN",
    emailVerified: user?.emailVerifiedAt != null,
  };
}