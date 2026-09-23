import "server-only";

import { OpportunityStatus, RiskEventType, UserStatus, WatchSessionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { getEligibleOpportunity } from "@/services/opportunities";
import {
  maxActiveWatchSessions,
  maxCompletionsPerHour,
  watchHeartbeatMinIntervalSeconds,
  watchMaxStepSeconds,
} from "@/lib/settings";
import { recordRiskEvent } from "@/services/risk";

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
 *
 * Deterministic, always-non-blocking fraud signals ride along:
 *  - a heartbeat arriving faster than the minimum interval,
 *  - progress claimed faster than real wall-clock time allows,
 *  - a single heartbeat claiming more progress than the configured max step.
 * All of these record a HEARTBEAT_ANOMALY risk event and never reject a
 * legitimate session (either direction).
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

  const now = Date.now();
  const wallSinceLast =
    session.lastHeartbeatAt ? (now - session.lastHeartbeatAt.getTime()) / 1000 : null;
  const claimedDelta = clamped - session.watchedDuration;

  try {
    const [minInterval, maxStep] = await Promise.all([
      watchHeartbeatMinIntervalSeconds(),
      watchMaxStepSeconds(),
    ]);
    if (wallSinceLast != null && wallSinceLast < minInterval) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.HEARTBEAT_ANOMALY,
        severity: "LOW",
        description: "Heartbeats arriving faster than the minimum interval.",
        entityType: "WatchSession",
        entityId: session.id,
        meta: { wallSinceLast: Math.round(wallSinceLast), minInterval },
        ipAddress: null,
      });
    }
    if (
      wallSinceLast != null &&
      claimedDelta > wallSinceLast + 2 // two-second tolerance for jitter/buffering
    ) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.HEARTBEAT_ANOMALY,
        severity: "MEDIUM",
        description: "Watch progress claimed ahead of wall-clock time.",
        entityType: "WatchSession",
        entityId: session.id,
        meta: { claimedDelta, wallSinceLast: Math.round(wallSinceLast) },
        ipAddress: null,
      });
    }
    if (claimedDelta > maxStep) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.HEARTBEAT_ANOMALY,
        severity: "MEDIUM",
        description: "A single heartbeat claimed far more progress than allowed.",
        entityType: "WatchSession",
        entityId: session.id,
        meta: { claimedDelta, maxStep },
        ipAddress: null,
      });
    }
  } catch {
    // Risk capture is best-effort and must never block progress.
  }

  const updated = await prisma.watchSession.update({
    where: { id: session.id },
    data: {
      status: WatchSessionStatus.IN_PROGRESS,
      watchedDuration: Math.max(session.watchedDuration, clamped),
      lastHeartbeatAt: new Date(now),
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
 *
 * Best-effort, non-blocking signals are also captured here: device/IP
 * mismatch against the originating session and suspicious completion volume.
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

  await captureCompletionRiskSignals(session, input);

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

/**
 * Non-blocking fraud signals evaluated at completion time. All failures are
 * swallowed: the completion path can never be degraded by the risk layer.
 */
async function captureCompletionRiskSignals(
  session: {
    id: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    startedAt: Date;
  },
  input: CompleteWatchInput,
): Promise<void> {
  try {
    if (
      session.ipAddress &&
      input.ip &&
      session.ipAddress !== input.ip
    ) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.DEVICE_IP_MISMATCH,
        severity: "MEDIUM",
        description: "Watch session completed from a different IP than it started on.",
        entityType: "WatchSession",
        entityId: session.id,
        meta: { startedIp: session.ipAddress, completedIp: input.ip },
        ipAddress: input.ip,
        userAgent: input.userAgent,
      });
    }
    if (
      session.userAgent &&
      input.userAgent &&
      session.userAgent !== input.userAgent
    ) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.SESSION_TAMPERING,
        severity: "MEDIUM",
        description: "Watch session completed with a different user agent.",
        entityType: "WatchSession",
        entityId: session.id,
        userAgent: input.userAgent,
      });
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [completionsThisHour, threshold] = await Promise.all([
      prisma.reward.count({
        where: { userId: input.userId, createdAt: { gte: hourAgo } },
      }),
      maxCompletionsPerHour(),
    ]);
    if (threshold > 0 && completionsThisHour + 1 > threshold) {
      await recordRiskEvent({
        userId: input.userId,
        type: RiskEventType.RAPID_CONSUMPTION,
        severity: "HIGH",
        description: "More watch completions than the per-hour threshold in the last hour.",
        entityType: "WatchSession",
        entityId: session.id,
        meta: { completionsThisHour, maxPerHour: threshold },
        ipAddress: input.ip,
      });
    }
  } catch {
    // best-effort
  }
}