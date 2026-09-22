import "server-only";

import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { RewardStatus, WatchSessionStatus } from "@/generated/prisma/enums";
import {
  requireAdvertiserContext,
  assertRole,
} from "@/lib/auth/advertiser";

const WATCHABLE_STATUSES: WatchSessionStatus[] = [WatchSessionStatus.COMPLETED, WatchSessionStatus.EXPIRED, WatchSessionStatus.CANCELLED, WatchSessionStatus.REJECTED];

function percent(value: number, of: number): number {
  if (of <= 0) return 0;
  return Math.round((value / of) * 100);
}

export async function getCampaignAnalytics(
  advertiserId: string,
  campaignId: string,
): Promise<Record<string, unknown>> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId },
    include: { opportunities: true, creatives: { select: { id: true } } },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");

  const opportunityIds = campaign.opportunities.map((o) => o.id);

  let sessionCounts: Array<{ status: WatchSessionStatus; _count: number }> = [];
  let rewardCounts: Array<{ status: RewardStatus; _count: number; _sum: { amount: number | null } }> = [];
  let totals: { _sum: { amount: number | null } } = { _sum: { amount: null } };

  if (opportunityIds.length) {
    [sessionCounts, rewardCounts, totals] = await Promise.all([
      prisma.watchSession.groupBy({
        by: ["status"],
        where: { opportunityId: { in: opportunityIds } },
        _count: true,
      }),
      prisma.reward.groupBy({
        by: ["status"],
        where: { opportunityId: { in: opportunityIds } },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.reward.aggregate({
        where: { opportunityId: { in: opportunityIds }, status: { notIn: [RewardStatus.REVERSED, RewardStatus.CANCELLED] } },
        _sum: { amount: true },
      }),
    ]);
  }

  const started =
    sessionCounts.find((s) => s.status === WatchSessionStatus.STARTED)?._count ?? 0;
  const inProgress =
    sessionCounts.find((s) => s.status === WatchSessionStatus.IN_PROGRESS)?._count ?? 0;
  const completedSessions =
    sessionCounts.find((s) => s.status === WatchSessionStatus.COMPLETED)?._count ?? 0;
  const expiredOrCancelled = sessionCounts
    .filter((s) => WATCHABLE_STATUSES.includes(s.status))
    .reduce((acc, s) => acc + s._count, 0);

  const verifiedCompletions =
    rewardCounts.filter((r) => r.status === RewardStatus.AVAILABLE).reduce((a, r) => a + r._count, 0) ??
    0;
  const pendingRewards =
    rewardCounts.filter((r) => r.status === RewardStatus.PENDING).reduce((a, r) => a + r._count, 0) ??
    0;
  const totalViewsStarted = started + inProgress + completedSessions + expiredOrCancelled;

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    },
    budget: {
      planned: campaign.budget,
      allocated: campaign.allocatedAmount,
      spent: campaign.spentAmount,
      remaining: campaign.remainingBudget,
      spentPercent: percent(campaign.spentAmount, campaign.allocatedAmount),
    },
    reach: {
      startedViews: totalViewsStarted,
      completedViews: campaign.completedViews,
      uniqueStarters: 0, // computed in getAdvertiserAnalytics
      creativeCount: campaign.creatives.length,
    },
    engagement: {
      completionRate: percent(campaign.completedViews, totalViewsStarted),
      currentCompletions: campaign.currentCompletions,
      maxCompletions: campaign.maxCompletions,
      fillRate: percent(campaign.currentCompletions, campaign.maxCompletions),
    },
    rewards: {
      pending: pendingRewards,
      available: verifiedCompletions,
      totalValueReversedOrCancelled: 0,
      totalValueGranted: totals._sum.amount ?? 0,
    },
  };
}

export async function getAdvertiserAnalytics(advertiserId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { advertiserId },
    include: { opportunities: { select: { id: true } } },
  });

  const opportunityIds = campaigns.flatMap((c) => c.opportunities.map((o) => o.id));

  const rewardAgg =
    opportunityIds.length > 0
      ? await prisma.reward.aggregate({
          where: {
            opportunityId: { in: opportunityIds },
            status: { notIn: [RewardStatus.REVERSED, RewardStatus.CANCELLED] },
          },
          _sum: { amount: true },
        })
      : null;
  const rewardValueGranted = rewardAgg?._sum.amount ?? 0;

  const byCampaign: Array<Record<string, unknown>> = [];
  for (const campaign of campaigns) {
    byCampaign.push(await getCampaignAnalytics(advertiserId, campaign.id));
  }

  return {
    totals: {
      campaigns: campaigns.length,
      plannedBudget: campaigns.reduce((a, c) => a + c.budget, 0),
      allocated: campaigns.reduce((a, c) => a + c.allocatedAmount, 0),
      spent: campaigns.reduce((a, c) => a + c.spentAmount, 0),
      remaining: campaigns.reduce((a, c) => a + c.remainingBudget, 0),
      completions: campaigns.reduce((a, c) => a + c.currentCompletions, 0),
      viewsStarted: campaigns.reduce((a, c) => a + c.startedViews, 0),
      viewsCompleted: campaigns.reduce((a, c) => a + c.completedViews, 0),
      rewardValueGranted,
    },
    byCampaign,
  };
}

export async function getDashboardCharts(advertiserId: string) {
  const ctx = await requireAdvertiserContext(advertiserId);
  assertRole(ctx, ["OWNER", "MANAGER", "ANALYST"]);

  const campaigns = await prisma.campaign.findMany({
    where: { advertiserId },
    select: {
      id: true,
      name: true,
      status: true,
      rewardPerCompletion: true,
      maxCompletions: true,
      budget: true,
      allocatedAmount: true,
      remainingBudget: true,
      spentAmount: true,
      currentCompletions: true,
      startedViews: true,
      completedViews: true,
      updatedAt: true,
    },
  });

  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      budget: c.budget,
      allocated: c.allocatedAmount,
      remaining: c.remainingBudget,
      spent: c.spentAmount,
      completions: c.currentCompletions,
      maxCompletions: c.maxCompletions,
      startedViews: c.startedViews,
      completedViews: c.completedViews,
      completionRate: percent(c.completedViews, c.startedViews),
      spendPercent: percent(c.spentAmount, c.allocatedAmount),
    })),
  };
}