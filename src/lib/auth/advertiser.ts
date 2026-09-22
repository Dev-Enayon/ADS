import "server-only";

import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import type { AdvertiserStatus } from "@/generated/prisma/enums";
import {
  getUserFromRequest,
  requireUserFromRequest,
  type ResolvedUser,
} from "@/lib/auth/session";
import type { AdvertiserContext } from "@/types/advertiser";

export type { AdvertiserContext };

/**
 * Resolves the advertiser context (profile + wallet + the caller's
 * membership) for a user. Returns null when the user has no advertiser
 * account.
 */
export async function getAdvertiserContext(
  userId: string,
): Promise<AdvertiserContext | null> {
  let advertiser = await prisma.advertiserProfile.findFirst({
    where: { userId },
    include: {
      wallet: true,
      members: { where: { userId }, take: 1 },
    },
  });
  let membership = advertiser?.members[0] ?? null;

  if (!membership) {
    const member = await prisma.advertiserMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        advertiserId: true,
        createdAt: true,
        advertiser: {
          include: {
            wallet: true,
            members: { where: { userId }, take: 1 },
          },
        },
      },
    });
    if (!member) return null;
    advertiser = member.advertiser;
    membership = {
      id: member.id,
      role: member.role,
      advertiserId: member.advertiserId,
      userId,
      createdAt: member.createdAt,
    };
  }
  if (!advertiser) return null;
  if (!membership) return null;

  const profile = {
    id: advertiser.id,
    userId: advertiser.userId,
    status: advertiser.status,
    businessName: advertiser.businessName,
    businessEmail: advertiser.businessEmail,
    businessPhone: advertiser.businessPhone,
    businessDescription: advertiser.businessDescription,
    website: advertiser.website,
    category: advertiser.category,
    country: advertiser.country,
    state: advertiser.state,
    city: advertiser.city,
    logoUrl: advertiser.logoUrl,
    createdAt: advertiser.createdAt,
    updatedAt: advertiser.updatedAt,
  };
  return {
    advertiser: profile as AdvertiserContext["advertiser"],
    wallet: advertiser.wallet
      ? {
          id: advertiser.wallet.id,
          availableBalance: advertiser.wallet.availableBalance,
          totalFunded: advertiser.wallet.totalFunded,
          totalAllocated: advertiser.wallet.totalAllocated,
          totalSpent: advertiser.wallet.totalSpent,
        }
      : null,
    membership: {
      id: membership.id,
      role: membership.role,
      advertiserId: membership.advertiserId,
      userId: membership.userId,
    },
  };
}

/** Returns the advertiser context or throws when the user has no account. */
export async function requireAdvertiserContext(
  userId: string,
): Promise<AdvertiserContext> {
  const ctx = await getAdvertiserContext(userId);
  if (!ctx) {
    throw Errors.notFound(
      "You do not have an advertiser account yet. Create one to get started.",
    );
  }
  return ctx;
}

export function assertRole(
  ctx: AdvertiserContext,
  roles: readonly string[],
): void {
  if (!roles.includes(ctx.membership.role)) {
    throw Errors.forbidden(
      "You do not have permission to perform this action in this advertiser account.",
    );
  }
}

/**
 * Gates advertising operations behind an ACTIVE advertiser account. Suspend
 * and reject states block all platform activity (rejected advertisers may
 * still view onboarding to fix details).
 */
export function assertAdvertiserActive(ctx: {
  advertiser: { status: AdvertiserStatus };
}): void {
  if (ctx.advertiser.status === "SUSPENDED") {
    throw Errors.suspended("This advertiser account is suspended.");
  }
  if (ctx.advertiser.status === "REJECTED") {
    throw Errors.forbidden(
      "This advertiser account was rejected. Contact support to resolve it.",
    );
  }
  if (ctx.advertiser.status !== "ACTIVE") {
    throw Errors.forbidden(
      "Your advertiser account has not been approved yet.",
    );
  }
}

/** Resolve advertiser context from an API request (must be a member). */
export async function requireAdvertiserFromRequest(
  req: Request,
): Promise<ResolvedUser & AdvertiserContext> {
  const current = await requireUserFromRequest(req);
  const ctx = await requireAdvertiserContext(current.user.id);
  return { ...current, ...ctx };
}

/** Resolve advertiser context from a request, returning null when absent. */
export async function getAdvertiserFromRequest(
  req: Request,
): Promise<(ResolvedUser & AdvertiserContext) | null> {
  const current = await getUserFromRequest(req);
  if (!current) return null;
  const ctx = await getAdvertiserContext(current.user.id);
  if (!ctx) return null;
  return { ...current, ...ctx };
}