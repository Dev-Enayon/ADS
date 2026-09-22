import "server-only";

import { OpportunityStatus, UserStatus, WatchSessionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { getEligibleOpportunity } from "@/services/opportunities";
import { maxActiveWatchSessions } from "@/lib/settings";

const OPEN_STATUSES: WatchSessionStatus[] = [
  WatchSessionStatus.STARTED,
  WatchSessionStatus.IN_PROGRESS,
];

export async function assertCanEarn(user: {
  status: string;
  emailVerifiedAt: Date | null;
}): Promise<void> {
  if (user.status === UserStatus.SUSPENDED) throw Errors.suspended();
  if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
    throw Errors.forbidden(
      "Your email must be verified to earn rewards. Check your inbox for the verification link.",
    );
  }
}

export type StartWatchInput = {
  userId: string;
  opportunityId: string;
  ip?: string | null;
  userAgent?: string | null;
};

export async function startWatchSession(input: StartWatchInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { wallet: true },
  });
  if (!user) throw Errors.unauthorized();
  await assertCanEarn(user);

  const opp = await getEligibleOpportunity(input.opportunityId);

  const existingOpen = await prisma.watchSession.findFirst({
    where: {
      userId: input.userId,
      opportunityId: opp.id,
      status: { in: OPEN_STATUSES },
    },
  });
  if (existingOpen) {
    return existingOpen; // resume
  }

  if (opp.maxCompletions != null && opp.currentCompletions >= opp.maxCompletions) {
    throw Errors.conflict("This opportunity has reached its completion limit.", "OPPORTUNITY_FULL");
  }

  const openCount = await prisma.watchSession.count({
    where: { userId: input.userId, status: { in: OPEN_STATUSES } },
  });
  const maxOpen = await maxActiveWatchSessions();
  if (maxOpen > 0 && openCount >= maxOpen) {
    throw Errors.conflict(
      "You already have active watch sessions. Finish or cancel one before starting another.",
      "TOO_MANY_ACTIVE_SESSIONS",
    );
  }

  const session = await prisma.watchSession.create({
    data: {
      userId: input.userId,
      opportunityId: opp.id,
      requiredDuration: opp.durationSeconds,
      watchedDuration: 0,
      status: WatchSessionStatus.STARTED,
      ipAddress: input.ip,
      userAgent: input.userAgent,
    },
  });

  // Analytics-only counter for advertiser campaigns. Non-fatal: a missing
  // campaign simply updates 0 rows.
  if (opp.campaignId) {
    await prisma.campaign.updateMany({
      where: { id: opp.campaignId },
      data: { startedViews: { increment: 1 } },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: "WATCH.STARTED",
      entityType: "WatchSession",
      entityId: session.id,
      meta: { opportunityId: opp.id, opportunityTitle: opp.title },
      ipAddress: input.ip,
    },
  });

  return session;
}

export type HeartbeatInput = {
  userId: string;
  watchSessionId: string;
  watchedSeconds: number;
};

/**
 * Records progress. The submitted time is never trusted for reward
 * eligibility (the server uses wall-clock elapsed time on completion); it is
 * only used to drive the progress UI and capped at the required duration.
 */
export async function heartbeatWatchSession(input: HeartbeatInput) {
  const session = await prisma.watchSession.findFirst({
    where: { id: input.watchSessionId, userId: input.userId },
  });
  if (!session) throw Errors.notFound("Watch session not found.");
  if (!OPEN_STATUSES.includes(session.status)) {
    throw Errors.conflict("This watch session is no longer active.", "SESSION_NOT_ACTIVE");
  }

  const clamped = Math.max(
    0,
    Math.min(Math.floor(input.watchedSeconds), session.requiredDuration),
  );

  const updated = await prisma.watchSession.update({
    where: { id: session.id },
    data: {
      status: WatchSessionStatus.IN_PROGRESS,
      watchedDuration: Math.max(session.watchedDuration, clamped),
      lastHeartbeatAt: new Date(),
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    watchedDuration: updated.watchedDuration,
    requiredDuration: updated.requiredDuration,
    remainingSeconds: Math.max(0, updated.requiredDuration - updated.watchedDuration),
  };
}

// ---------------------------------------------------------------------------
// Completion (authoritative server-side check + reward grant)
// ---------------------------------------------------------------------------

import { completeWatchSessionTx } from "@/services/rewards";

export type CompleteWatchInput = {
  userId: string;
  watchSessionId: string;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Server-authoritative completion.
 * - Wall-clock elapsed time must meet the required duration.
 * - Only STARTED/IN_PROGRESS sessions can complete (atomic guard).
 * - One reward per session (unique watchSessionId).
 */
export async function completeWatchSession(input: CompleteWatchInput) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw Errors.unauthorized();
  await assertCanEarn(user);

  const session = await prisma.watchSession.findUnique({
    where: { id: input.watchSessionId },
    include: { opportunity: true },
  });
  if (!session || session.userId !== input.userId) {
    throw Errors.notFound("Watch session not found.");
  }
  if (!OPEN_STATUSES.includes(session.status)) {
    throw Errors.conflict("This watch session is no longer active.", "SESSION_NOT_ACTIVE");
  }
  if (session.opportunity.status !== OpportunityStatus.ACTIVE) {
    throw Errors.conflict("This opportunity is no longer active.", "OPPORTUNITY_UNAVAILABLE");
  }

  const elapsedSeconds = (Date.now() - session.startedAt.getTime()) / 1000;
  if (elapsedSeconds < session.requiredDuration) {
    throw Errors.conflict(
      "Watch time not yet complete. Please finish watching the video.",
      "WATCH_INCOMPLETE",
    );
  }

  const reward = await completeWatchSessionTx({
    tx: prisma,
    userId: input.userId,
    watchSessionId: session.id,
    opportunityId: session.opportunityId,
    rewardAmount: session.opportunity.rewardAmount,
    opportunityTitle: session.opportunity.title,
    requiredDuration: session.requiredDuration,
    ip: input.ip,
    campaignId: session.opportunity.campaignId,
    advertiserId: session.opportunity.advertiserId,
  });

  return { reward };
}