import "server-only";

import { UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import {
  generateReferralCode,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/security/password";
import { deviceNameFromUserAgent } from "@/lib/device";
import { sendEmail } from "@/lib/email";
import { createReferralForNewUser } from "@/services/referrals";
import { issueSessionToken, revokeSession } from "@/lib/auth/session";
import type { NotificationType } from "@/generated/prisma/enums";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export type RegisterInput = {
  email: string;
  password: string;
  fullName?: string;
  referralCode?: string | null;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ClientUser = {
  id: string;
  email: string;
  status: UserStatus;
  emailVerified: boolean;
  referralCode: string;
  role: string;
  profile: { fullName: string | null; avatarUrl: string | null } | null;
  wallet: { availableBalance: number; pendingBalance: number } | null;
};

function toClientUser(user: {
  id: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  referralCode: string;
  role: string;
}): Omit<ClientUser, "profile" | "wallet"> {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    emailVerified: user.emailVerifiedAt != null,
    referralCode: user.referralCode,
    role: user.role,
  };
}

async function createDeviceRecord(userId: string, ua: string | null | undefined, ip: string | null | undefined) {
  const name = deviceNameFromUserAgent(ua);
  return prisma.device.create({
    data: {
      userId,
      name,
      userAgent: ua ?? null,
      ipAddress: ip ?? null,
    },
  });
}

async function issueSession(
  userId: string,
  ctx: { ip: string | null; userAgent: string | null },
) {
  const device = await createDeviceRecord(userId, ctx.userAgent, ctx.ip);
  const token = issueSessionToken();
  const session = await prisma.session.create({
    data: {
      userId,
      deviceId: device.id,
      tokenHash: hashToken(token),
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { token, session, device };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function register(input: RegisterInput, ctx: { ip: string | null; userAgent: string | null }) {
  const email = input.email.toLowerCase().trim();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      throw Errors.conflict(
        "An account with this email already exists. Try signing in instead.",
        "EMAIL_IN_USE",
      );
    }

    const passwordHash = await hashPassword(input.password);
    const referralCode = generateReferralCode();

    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        status: UserStatus.PENDING_VERIFICATION,
        referralCode,
        profile: {
          create: {
            fullName: input.fullName?.trim() || null,
          },
        },
        wallet: {
          create: {},
        },
      },
      include: { profile: true, wallet: true },
    });

    if (input.referralCode) {
      await createReferralForNewUser({
        tx,
        referredUserId: user.id,
        referralCode: input.referralCode.trim().toUpperCase(),
      });
    }

    const verificationToken = generateToken(32);
    await tx.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(verificationToken),
        expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      },
    });

    await sendVerificationEmail(email, verificationToken);

    await tx.auditLog.create({
      data: { userId: user.id, action: "AUTH.REGISTER", ipAddress: ctx.ip },
    });

    return toClientUser(user);
  });
}

async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Verify your email address",
    text: [
      "Welcome to RewardHub!",
      "",
      "Please verify your email address to activate your account:",
      link,
      "",
      "This link expires in 24 hours.",
    ].join("\n"),
  });
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

export async function login(
  input: LoginInput,
  ctx: { ip: string | null; userAgent: string | null },
): Promise<{
  user: ClientUser;
  token: string;
  deviceId: string;
}> {
  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true, wallet: true },
  });

  const now = Date.now();
  if (user && user.lockedUntil && user.lockedUntil.getTime() > now) {
    throw Errors.tooManyRequests(
      "Too many failed attempts. Try again in a few minutes.",
    );
  }

  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    if (user) {
      const attempts = user.failedLoginAttempts + 1;
      if (attempts >= MAX_FAILED_LOGINS) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: new Date(now + LOGIN_LOCKOUT_MS) },
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: attempts },
        });
      }
    }
    // Generic message: no account enumeration.
    throw Errors.badRequest("Invalid email or password.", "INVALID_CREDENTIALS");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  if (user.status === UserStatus.SUSPENDED) {
    throw Errors.suspended();
  }

  const { token, session, device } = await issueSession(user.id, ctx);

  await prisma.auditLog.create({
    data: { userId: user.id, action: "AUTH.LOGIN", ipAddress: ctx.ip, entityId: session.id, entityType: "Session" },
  });

  return {
    user: {
      ...toClientUser(user),
      profile: { fullName: user.profile?.fullName ?? null, avatarUrl: user.profile?.avatarUrl ?? null },
      wallet:
        user.wallet ? { availableBalance: user.wallet.availableBalance, pendingBalance: user.wallet.pendingBalance } : null,
    },
    token,
    deviceId: device.id,
  };
}

/**
 * Merge profile/wallet info after login. Kept separate because login's user
 * fetch omits relations; the dashboard reads authoritative state anyway.
 */
export async function logout(sessionId: string, ip?: string | null): Promise<void> {
  await revokeSession(sessionId);
  await prisma.auditLog.create({
    data: { action: "AUTH.LOGOUT", ipAddress: ip ?? null, entityId: sessionId, entityType: "Session" },
  });
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(rawToken: string, ip?: string | null): Promise<{ email: string }> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.emailVerification.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw Errors.badRequest(
        "This verification link is invalid or has expired. Request a new one.",
        "INVALID_TOKEN",
      );
    }
    const user = await tx.user.update({
      where: { id: record.userId },
      data: {
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
    });
    await tx.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.auditLog.create({
      data: { userId: user.id, action: "AUTH.EMAIL_VERIFIED", ipAddress: ip ?? null },
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        type: "ACCOUNT_STATUS" as NotificationType,
        title: "Email verified",
        message: "Your email has been verified. Your account is now active.",
      },
    });
    return { email: user.email };
  });
}

export async function resendVerificationEmail(
  userId: string,
  email: string,
): Promise<void> {
  const token = generateToken(32);
  await prisma.$transaction(async (tx) => {
    await tx.emailVerification.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.emailVerification.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      },
    });
  });
  await sendVerificationEmail(email, token);
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Always returns success even when the email is unknown (anti-enumeration).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user) return;

  const token = generateToken(32);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
  });

  const link = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your password",
    text: [
      "We received a request to reset your RewardHub password.",
      "",
      lineBreak,
      `Reset password: ${link}`,
      "",
      "This link expires in 1 hour. If you did not request this, you can ignore this email.",
    ].join("\n"),
  });
}

const lineBreak = "──────────────────────────";

export async function resetPassword(
  rawToken: string,
  newPassword: string,
  ip?: string | null,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw Errors.badRequest(
        "This reset link is invalid or has expired. Request a new one.",
        "INVALID_TOKEN",
      );
    }
    const passwordHash = await hashPassword(newPassword);
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: { userId: record.userId, action: "AUTH.PASSWORD_RESET", ipAddress: ip ?? null },
    });
    await tx.notification.create({
      data: {
        userId: record.userId,
        type: "SECURITY" as NotificationType,
        title: "Password changed",
        message: "Your password was reset. All devices have been signed out.",
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Change password (authenticated)
// ---------------------------------------------------------------------------

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionId: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.unauthorized();
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw Errors.badRequest("Current password is incorrect.", "INVALID_CURRENT_PASSWORD");
    }
    const passwordHash = await hashPassword(newPassword);
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
    const revoked = await tx.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: { userId, action: "AUTH.PASSWORD_CHANGED", entityId: keepSessionId, entityType: "Session" },
    });
    await tx.notification.create({
      data: {
        userId,
        type: "SECURITY" as NotificationType,
        title: "Password changed",
        message: "Your password was updated. Other sessions have been signed out.",
      },
    });
    return revoked.count;
  });
}