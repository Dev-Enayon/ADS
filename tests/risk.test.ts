import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import {
  ReferralStatus,
  RewardStatus,
  RiskEventType,
  UserStatus,
} from "../src/generated/prisma/enums";
import { createUser, createAdmin, createOpportunity } from "./helpers";
import { recordRiskEvent } from "../src/services/risk";
import { invalidateSettingsCache } from "../src/lib/settings";
import {
  startWatchSession,
  heartbeatWatchSession,
  completeWatchSession,
} from "../src/services/watch";
import { maybeCreditReferrer } from "../src/services/referrals";
import {
  listRiskEvents,
  getRiskEventDetail,
  resolveRiskEvent,
  riskSummary,
} from "../src/services/admin/risk";

describe("risk: recording", () => {
  it("creates a HIGH event, a notification and dedupes repeats while open", async () => {
    const user = await createUser({ verified: true });

    const first = await recordRiskEvent({
      userId: user.id,
      type: RiskEventType.WITHDRAWAL_ABUSE,
      severity: "HIGH",
      description: "Withdrawal requests above the per-hour threshold.",
      entityType: "Withdrawal",
      ipAddress: "127.0.0.1",
    });
    expect(first.created).toBe(true);

    const dup = await recordRiskEvent({
      userId: user.id,
      type: RiskEventType.WITHDRAWAL_ABUSE,
      severity: "HIGH",
      description: "Withdrawal requests above the per-hour threshold.",
      entityType: "Withdrawal",
    });
    expect(dup.created).toBe(false);
    expect(dup.id).toBe(first.id);

    await expect(prisma.riskEvent.count()).resolves.toBe(1);
    // HIGH risk always notifies the member (non-fatal path).
    await expect(prisma.notification.count({ where: { type: "HIGH_RISK_FLAG" } })).resolves.toBe(1);
  });

  it("auto-suspends when the ACCOUNT_SUSPENSION_HIGH_RISK setting is enabled", async () => {
    const user = await createUser({ verified: true });
    await prisma.platformSetting.upsert({
      where: { key: "ACCOUNT_SUSPENSION_HIGH_RISK" },
      update: { value: "true" },
      create: { key: "ACCOUNT_SUSPENSION_HIGH_RISK", value: "true", description: "Auto-suspend on HIGH risk." },
    });
    invalidateSettingsCache();

    await recordRiskEvent({
      userId: user.id,
      type: RiskEventType.ACCOUNT_FLAG,
      severity: "HIGH",
      description: "Repeated unusual sign-in signals.",
    });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.status).toBe(UserStatus.SUSPENDED);
    await expect(
      prisma.notification.count({ where: { userId: user.id, type: "ACCOUNT_SUSPENDED" } }),
    ).resolves.toBe(1);

    // Leave the settings cache clean for the next test.
    invalidateSettingsCache();
  });

  it("records a LOW event without blocking the caller", async () => {
    const user = await createUser({ verified: true });
    const result = await recordRiskEvent({
      userId: user.id,
      type: RiskEventType.RAPID_CONSUMPTION,
      severity: "LOW",
      description: "Many rapid watch completions.",
    });
    expect(result.created).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe(
      UserStatus.ACTIVE,
    );
  });
});

describe("risk: monitoring triggers", () => {
  it("flags a heartbeat claiming more progress than the max step, non-blockingly", async () => {
    const user = await createUser({ verified: true });
    const opp = await createOpportunity({ durationSeconds: 300 });
    const session = await startWatchSession({ userId: user.id, opportunityId: opp.id });

    // 100 claimed seconds vs a 30s max step -> MEDIUM anomaly, session keeps going.
    const first = await heartbeatWatchSession({
      userId: user.id,
      watchSessionId: session.id,
      watchedSeconds: 100,
    });
    expect(first.watchedDuration).toBe(100);

    let events = await prisma.riskEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(RiskEventType.HEARTBEAT_ANOMALY);
    expect(events[0].severity).toBe("MEDIUM");
    expect(events[0].description).toContain("far more progress");

    // A follow-up heartbeat claiming the rest is flagged for outrunning
    // wall-clock time (200s of progress in under a real second).
    await heartbeatWatchSession({
      userId: user.id,
      watchSessionId: session.id,
      watchedSeconds: 300,
    });

    events = await prisma.riskEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(events.every((e) => e.type === RiskEventType.HEARTBEAT_ANOMALY)).toBe(true);
    expect(events.some((e) => e.description.includes("ahead of wall-clock time"))).toBe(true);
    expect(events.length).toBeGreaterThan(1);

    // Deterministic signals only: nothing about the user changed.
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status,
    ).toBe(UserStatus.ACTIVE);

    const summary = await riskSummary();
    expect(summary.unresolved).toBeGreaterThanOrEqual(2);
    expect(summary.bySeverity.MEDIUM).toBeGreaterThanOrEqual(2);
  });

  it("flags rapid successful completions past the per-hour threshold, without suspending", async () => {
    const user = await createUser({ verified: true });
    const opp = await createOpportunity({ durationSeconds: 10 });
    await prisma.platformSetting.upsert({
      where: { key: "MAX_COMPLETIONS_PER_HOUR" },
      update: { value: "1" },
      create: { key: "MAX_COMPLETIONS_PER_HOUR", value: "1", description: "Test: 1 completion per hour." },
    });
    invalidateSettingsCache();

    async function completeOnce() {
      const session = await startWatchSession({ userId: user.id, opportunityId: opp.id });
      // Backdate so the wall-clock completion check passes.
      await prisma.watchSession.update({
        where: { id: session.id },
        data: { startedAt: new Date(Date.now() - 30_000) },
      });
      await completeWatchSession({ userId: user.id, watchSessionId: session.id });
    }

    await completeOnce(); // 1 in the hour -> allowed, no flag
    await completeOnce(); // 2 in the hour -> above threshold

    const flag = await prisma.riskEvent.findFirstOrThrow({
      where: { userId: user.id, type: RiskEventType.RAPID_CONSUMPTION },
    });
    expect(flag.severity).toBe("HIGH");
    expect(await prisma.reward.count({ where: { userId: user.id } })).toBe(2);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status,
    ).toBe(UserStatus.ACTIVE);

    const summary = await riskSummary();
    expect(summary.bySeverity.HIGH).toBe(1);

    invalidateSettingsCache();
  });

  it("flags a quick referral chain when the suspicious threshold is enabled", async () => {
    const referrer = await createUser({ verified: true });
    const referred = await createUser({ verified: true });
    await prisma.platformSetting.upsert({
      where: { key: "SUSPICIOUS_REFERRAL_THRESHOLD" },
      update: { value: "1" },
      create: { key: "SUSPICIOUS_REFERRAL_THRESHOLD", value: "1", description: "Test: 1 referral per hour." },
    });
    invalidateSettingsCache();

    const opp = await createOpportunity({ durationSeconds: 10 });
    const session = await prisma.watchSession.create({
      data: {
        userId: referred.id,
        opportunityId: opp.id,
        requiredDuration: opp.durationSeconds,
        watchedDuration: 0,
        status: "STARTED",
      },
    });
    await prisma.referral.create({
      data: { referrerId: referrer.id, referredUserId: referred.id },
    });
    // First AVAILABLE reward on the referred account triggers the referrer check.
    await prisma.reward.create({
      data: {
        userId: referred.id,
        opportunityId: opp.id,
        watchSessionId: session.id,
        amount: 1000,
        status: RewardStatus.AVAILABLE,
      },
    });

    expect(await maybeCreditReferrer(referred.id)).toBe(true);

    const flag = await prisma.riskEvent.findFirstOrThrow({
      where: { userId: referrer.id, type: RiskEventType.SUSPICIOUS_REFERRAL },
    });
    expect(flag.severity).toBe("HIGH");

    const referral = await prisma.referral.findUniqueOrThrow({
      where: { referredUserId: referred.id },
    });
    expect(referral.status).toBe(ReferralStatus.COMPLETED);

    const summary = await riskSummary();
    expect(summary.unresolved).toBe(1);
    expect(summary.bySeverity.HIGH).toBe(1);

    invalidateSettingsCache();
  });
});

describe("risk: admin console", () => {
  it("lists events with default fallbacks and resolves them as an admin", async () => {
    const admin = await createAdmin({ super: true });
    const user = await createUser({ verified: true });
    const { id } = await recordRiskEvent({
      userId: user.id,
      type: RiskEventType.SESSION_TAMPERING,
      severity: "MEDIUM",
      description: "Session fingerprint changed mid-use.",
      ipAddress: "10.0.0.1",
    });

    const page = await listRiskEvents({});
    expect(page.total).toBe(1);
    expect(page.rows[0].user.email).toBe(user.email);

    const detail = await getRiskEventDetail(id);
    expect(detail.resolved).toBe(false);
    expect(detail.user.id).toBe(user.id);

    const before = await riskSummary();
    expect(before.unresolved).toBe(1);
    expect(before.bySeverity.MEDIUM).toBe(1);

    await resolveRiskEvent({
      riskEventId: id,
      actorId: admin.id,
      resolution: "TURNED_OUT_FINE",
    });
    expect((await getRiskEventDetail(id)).resolution).toBe("TURNED_OUT_FINE");

    const summary = await riskSummary();
    expect(summary.unresolved).toBe(0);
    expect(summary.bySeverity.MEDIUM).toBeUndefined();
    expect(summary.resolvedByType.SESSION_TAMPERING).toBe(1);

    const unresolvedOnly = await listRiskEvents({ resolved: false });
    expect(unresolvedOnly.total).toBe(0);
  });

  it("conflicts when resolving an already-resolved event", async () => {
    const admin = await createAdmin();
    const user = await createUser({ verified: true });
    const { id } = await recordRiskEvent({
      userId: user.id,
      type: RiskEventType.ACCOUNT_FLAG,
      severity: "LOW",
      description: "Review requested.",
    });
    await resolveRiskEvent({ riskEventId: id, actorId: admin.id, resolution: "All clear." });
    await expect(
      resolveRiskEvent({ riskEventId: id, actorId: admin.id, resolution: "Again." }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});