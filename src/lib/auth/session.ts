import "server-only";

import { cookies } from "next/headers";
import { type NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { Errors } from "@/lib/errors";
import {
  generateToken,
  hashToken,
  safeEqual,
} from "@/lib/security/password";
import { appUserInclude, type SafeUser } from "@/types/relations";

export const SESSION_COOKIE = env.sessionCookieName;
export const SESSION_TTL_DAYS = env.sessionTtlDays;

const SESSION_TOKEN_LENGTH = 32;
const lastActiveThrottleMs = 5 * 60 * 1000;

export function sessionMaxAgeMs(): number {
  return SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionMaxAgeMs() / 1000,
  };
}

export function setSessionCookie(
  res: NextResponse,
  token: string,
): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
  return res;
}

export function issueSessionToken(): string {
  return generateToken(SESSION_TOKEN_LENGTH);
}

export function tokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("=")) || null;
  }
  return null;
}

/** Read the session token from the Next.js cookie jar. */
export async function tokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function resolveSession(rawToken: string) {
  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashToken(rawToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { include: appUserInclude() } },
  });
  if (!session) return null;
  if (session.lastActiveAt.getTime() < Date.now() - lastActiveThrottleMs) {
    prisma.session
      .updateMany({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);
  }
  return session;
}

export type ResolvedUser = { user: SafeUser; sessionId: string };

/**
 * Core session validation. Resolves the current user from the session token.
 * Also touches lastActiveAt at most every few minutes.
 */
export async function getCurrentUser(): Promise<ResolvedUser | null> {
  const token = await tokenFromCookies();
  if (!token) return null;
  const session = await resolveSession(token);
  if (!session) return null;
  return { user: session.user, sessionId: session.id };
}

/** Validate a raw token string directly (used by internal tooling/tests). */
export async function getUserByToken(token: string): Promise<ResolvedUser | null> {
  const session = await resolveSession(token);
  if (!session) return null;
  return { user: session.user, sessionId: session.id };
}

/** Resolve the authenticated user from an API Request (route handlers). */
export async function getUserFromRequest(req: Request): Promise<ResolvedUser | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const session = await resolveSession(token);
  if (!session) return null;
  return { user: session.user, sessionId: session.id };
}

/** Same as getUserFromRequest but throws 401 when unauthenticated. */
export async function requireUserFromRequest(req: Request): Promise<ResolvedUser> {
  const current = await getUserFromRequest(req);
  if (!current) throw Errors.unauthorized();
  return current;
}

/** Confirm a challenge token matches a stored hash (constant-time). */
export function tokenMatches(rawToken: string, storedHash: string): boolean {
  return safeEqual(hashToken(rawToken), storedHash);
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId } },
    data: { revokedAt: new Date() },
  });
  return result.count;
}