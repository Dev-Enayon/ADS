import "server-only";

import { OpportunitySource, OpportunityStatus, WatchSessionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { isCampaignLiveForFeed, syncCampaignLifecycle } from "@/services/campaigns";

export type PublicOpportunity = {
  id: string;
  title: string;
  description: string;
  type: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  rewardAmount: number;
  source: string;
  isFeatured: boolean;
  eligible: boolean;
  maxCompletions: number | null;
  currentCompletions: number;
  openSession: {
    id: string;
    status: WatchSessionStatus;
    startedAt: Date;
    watchedDuration: number;
    requiredDuration: number;
  } | null;
};

export function availableWhereClause() {
  const now = new Date();
  return {
    status: OpportunityStatus.ACTIVE,
    OR: [{ endDate: null }, { endDate: { gte: now } }],
    AND: { OR: [{ startDate: null }, { startDate: { lte: now } }] },
  };
}

function isEligibleOpp(opp: {
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  maxCompletions: number | null;
  currentCompletions: number;
  source: string;
  campaign?: {
    status: string;
    remainingBudget: number;
    rewardPerCompletion: number;
    currentCompletions: number;
    maxCompletions: number;
    startDate: Date | null;
    endDate: Date | null;
    advertiser: { status: string } | null;
  } | null;
}): boolean {
  const now = Date.now();
  if (opp.status !== OpportunityStatus.ACTIVE) return false;
  if (opp.startDate && opp.startDate.getTime() > now) return false;
  if (opp.endDate && opp.endDate.getTime() < now) return false;
  if (opp.maxCompletions != null && opp.currentCompletions >= opp.maxCompletions) return false;
  if (opp.source === OpportunitySource.ADVERTISER) {
    if (!opp.campaign) return false;
    if (opp.campaign.advertiser && opp.campaign.advertiser.status !== "ACTIVE") return false;
    return isCampaignLiveForFeed(opp.campaign);
  }
  return true;
}

export async function listOpportunities(userId?: string): Promise<PublicOpportunity[]> {
  // Keep campaign state and the opportunity feed listing in sync before
  // serving it (idempotent, bounded work).
  await syncCampaignLifecycle();

  const [opps, userSessions] = await Promise.all([
    prisma.opportunity.findMany({
      where: availableWhereClause(),
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      include: {
        campaign: {
          select: {
            status: true,
            remainingBudget: true,
            rewardPerCompletion: true,
            currentCompletions: true,
            maxCompletions: true,
            startDate: true,
            endDate: true,
            advertiser: { select: { status: true } },
          },
        },
      },
    }),
    userId
      ? prisma.watchSession.findMany({
          where: {
            userId,
            status: { in: [WatchSessionStatus.STARTED, WatchSessionStatus.IN_PROGRESS] },
          },
        })
      : Promise.resolve([]),
  ]);

  const openByOpp = new Map<string, (typeof userSessions)[number]>();
  for (const session of userSessions) {
    openByOpp.set(session.opportunityId, session);
  }

  return opps.map((opp) => {
    const open = openByOpp.get(opp.id);
    return {
      id: opp.id,
      title: opp.title,
      description: opp.description,
      type: opp.type,
      videoUrl: opp.videoUrl,
      thumbnailUrl: opp.thumbnailUrl,
      durationSeconds: opp.durationSeconds,
      rewardAmount: opp.rewardAmount,
      source: opp.source,
      isFeatured: opp.isFeatured,
      eligible: isEligibleOpp(opp),
      maxCompletions: opp.maxCompletions,
      currentCompletions: opp.currentCompletions,
      openSession: open
        ? {
            id: open.id,
            status: open.status,
            startedAt: open.startedAt,
            watchedDuration: open.watchedDuration,
            requiredDuration: open.requiredDuration,
          }
        : null,
    };
  });
}

export async function getOpportunityById(id: string) {
  const opp = await prisma.opportunity.findUnique({ where: { id } });
  if (!opp) throw Errors.notFound("Opportunity not found.");
  return opp;
}

/** Returns an opportunity only when it is currently watchable. */
export async function getEligibleOpportunity(id: string) {
  const opp = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      campaign: {
        select: {
          status: true,
          remainingBudget: true,
          rewardPerCompletion: true,
          currentCompletions: true,
          maxCompletions: true,
          startDate: true,
          endDate: true,
          advertiser: { select: { status: true } },
        },
      },
    },
  });
  if (!opp) throw Errors.notFound("Opportunity not found.");
  if (!isEligibleOpp(opp)) {
    throw Errors.conflict("This opportunity is not currently available.", "OPPORTUNITY_UNAVAILABLE");
  }
  return opp;
}