import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/db";
import {
  register,
  login,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
} from "../src/lib/auth/service";
import { hashToken } from "../src/lib/security/password";
import { UserStatus } from "../src/generated/prisma/enums";
import { createUser } from "./helpers";

const ctx = { ip: "127.0.0.1", userAgent: "vitest" };

describe("auth: register", () => {
  it("creates a pending-verification user with wallet, profile and a verification token", async () => {
    const user = await register(
      { email: "new@test.dev", password: "super-secure-1", fullName: "Ada" },
      ctx,
    );
    expect(user.email).toBe("new@test.dev");
    expect(user.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(user.emailVerified).toBe(false);

    const row = await prisma.user.findUniqueOrThrow({
      where: { email: user.email },
      include: { profile: true, wallet: true },
    });
    expect(row.profile).not.toBeNull();
    expect(row.wallet).not.toBeNull();
    expect(row.wallet?.availableBalance).toBe(0);
    expect(await prisma.emailVerification.count({ where: { userId: row.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "AUTH.REGISTER" } })).toBe(1);
  });

  it("rejects duplicate emails (case-insensitive) as EMAIL_IN_USE", async () => {
    await register({ email: "dup@test.dev", password: "super-secure-1" }, ctx);
    await expect(
      register({ email: "DUP@test.dev", password: "super-secure-1" }, ctx),
    ).rejects.toMatchObject({ code: "EMAIL_IN_USE" });
  });

  it("links a referral when a valid code is supplied", async () => {
    const referrer = await createUser();
    await register(
      { email: "referral@test.dev", password: "super-secure-1", referralCode: referrer.referralCode },
      ctx,
    );
    const referred = await prisma.user.findUniqueOrThrow({ where: { email: "referral@test.dev" } });
    expect(referred.referredById).toBe(referrer.id);
    const referral = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: referred.id } });
    expect(referral.referrerId).toBe(referrer.id);
    expect(referral.status).toBe("PENDING");
  });

  it("rejects an invalid referral code at registration", async () => {
    await expect(
      register(
        { email: "self@test.dev", password: "super-secure-1", referralCode: "RHINVALID" },
        ctx,
      ),
    ).rejects.toThrowError(/not valid/i);
  });
});

describe("auth: login", () => {
  it("logs in with correct credentials and issues a session + device", async () => {
    await createUser({ email: "login@test.dev", password: "right-password-1", verified: true });
    const result = await login({ email: "login@test.dev", password: "right-password-1" }, ctx);
    expect(result.token).toBeTruthy();
    expect(await prisma.session.count({ where: { userId: result.user.id } })).toBe(1);
    expect(await prisma.device.count({ where: { userId: result.user.id } })).toBe(1);
  });

  it("rejects wrong passwords with a generic message (no enumeration)", async () => {
    await createUser({ email: "flags@test.dev", password: "right-password-1" });
    await expect(
      login({ email: "flags@test.dev", password: "wrong-password" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      login({ email: "nobody@test.dev", password: "wrong-password" }, ctx),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("locks the account after 5 failed attempts", async () => {
    await createUser({ email: "lock@test.dev", password: "right-password-1" });
    for (let i = 0; i < 5; i++) {
      await expect(login({ email: "lock@test.dev", password: "wrong" }, ctx)).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
      });
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "lock@test.dev" } });
    expect(user.lockedUntil).not.toBeNull();
    await expect(
      login({ email: "lock@test.dev", password: "right-password-1" }, ctx),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("blocks suspended users", async () => {
    await createUser({ email: "suspended@test.dev", password: "right-password-1" });
    await prisma.user.update({
      where: { email: "suspended@test.dev" },
      data: { status: UserStatus.SUSPENDED },
    });
    await expect(
      login({ email: "suspended@test.dev", password: "right-password-1" }, ctx),
    ).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });
});

describe("auth: verification", () => {
  it("verifies, activates and cannot be replayed", async () => {
    const email = "verify@test.dev";
    const user = await createUser({ email, verified: false });
    const raw = "raw-token-abcdefghijklmnop";
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const result = await verifyEmail(raw, "127.0.0.1");
    expect(result.email).toBe(email);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.status).toBe(UserStatus.ACTIVE);
    expect(row.emailVerifiedAt).not.toBeNull();

    await expect(verifyEmail(raw, "127.0.0.1")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});

describe("auth: password reset", () => {
  it("does not reveal whether an email exists", async () => {
    await expect(requestPasswordReset("missing@test.dev")).resolves.toBeUndefined();
  });

  it("resets the password and revokes all sessions", async () => {
    const email = "reset@test.dev";
    const user = await createUser({ email, password: "old-password-1", verified: true });

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken("existing-token"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await requestPasswordReset(email);
    const raw = "raw-reset-token-abc123456";
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await resetPassword(raw, "brand-new-password", "127.0.0.1");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordChangedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);

    await expect(resetPassword(raw, "totally-different", "127.0.0.1")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
});