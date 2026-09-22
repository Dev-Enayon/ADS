import "server-only";

import { NotificationType, TeamRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { createNotification } from "@/services/notifications";
import { requireAdvertiserContext, assertRole, assertAdvertiserActive } from "@/lib/auth/advertiser";
import { advertiserReviewMode } from "@/lib/settings";

export type CreateAdvertiserInput = {
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  businessDescription?: string;
  website?: string;
  category?: string;
  country?: string;
  state?: string;
  city?: string;
  logoUrl?: string;
};

export async function createAdvertiserProfile(
  userId: string,
  input: CreateAdvertiserInput,
  opts: { ip?: string | null } = {},
) {
  const existing = await prisma.advertiserProfile.findUnique({ where: { userId } });
  if (existing) {
    throw Errors.conflict("You already have an advertiser account.", "ADVERTISER_EXISTS");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.unauthorized();
  if (user.status === "SUSPENDED") throw Errors.suspended();

  const mode = await advertiserReviewMode();
  const status = mode === "auto" ? "ACTIVE" : "PENDING";

  const advertiser = await prisma.advertiserProfile.create({
    data: {
      userId,
      status,
      businessName: input.businessName,
      businessEmail: input.businessEmail,
      businessPhone: input.businessPhone ?? null,
      businessDescription: input.businessDescription ?? null,
      website: input.website ?? null,
      category: input.category ?? null,
      country: input.country ?? null,
      state: input.state ?? null,
      city: input.city ?? null,
      logoUrl: input.logoUrl ?? null,
      wallet: { create: {} },
      members: {
        create: { userId, role: TeamRole.OWNER },
      },
    },
    include: { wallet: true, members: true },
  });

  await audit({
    userId,
    action: "ADVERTISER.CREATED",
    entityType: "AdvertiserProfile",
    entityId: advertiser.id,
    meta: { businessName: input.businessName, businessEmail: input.businessEmail, status },
    ip: opts.ip,
  });
  await createNotification({
    userId,
    type: NotificationType.ACCOUNT_STATUS,
    title: "Advertiser account created",
    message:
      status === "ACTIVE"
        ? "Your advertiser account is active. You can now create and submit campaigns."
        : "Your advertiser account is pending approval. We will notify you when it is active.",
  });

  return advertiser;
}

export async function updateAdvertiserProfile(
  userId: string,
  input: Partial<CreateAdvertiserInput>,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, [TeamRole.OWNER, TeamRole.MANAGER]);

  const updatable: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updatable[k] = v === "" ? null : v;
  }

  const advertiser = await prisma.advertiserProfile.update({
    where: { id: ctx.advertiser.id },
    data: updatable,
  });

  await audit({
    userId,
    action: "ADVERTISER.UPDATED",
    entityType: "AdvertiserProfile",
    entityId: advertiser.id,
    meta: { fields: Object.keys(updatable) },
    ip: opts.ip,
  });
  return advertiser;
}

export async function getAdvertiserOwnProfile(userId: string) {
  const ctx = await requireAdvertiserContext(userId);
  return prisma.advertiserProfile.findUnique({
    where: { id: ctx.advertiser.id },
    include: {
      user: { include: { profile: true } },
      wallet: true,
      members: { include: { user: { select: { id: true, email: true, profile: { select: { fullName: true } } } } } },
    },
  });
}

export async function listMembers(advertiserId: string) {
  return prisma.advertiserMember.findMany({
    where: { advertiserId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addMember(
  userId: string,
  input: { email: string; role: TeamRole },
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, [TeamRole.OWNER, TeamRole.MANAGER]);
  assertAdvertiserActive(ctx);

  const invitee = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!invitee || !invitee.emailVerifiedAt) {
    throw Errors.notFound("No verified user exists with that email.");
  }
  if (invitee.id === ctx.advertiser.userId) {
    throw Errors.conflict("The owner is already a member.", "MEMBER_EXISTS");
  }

  if (input.role === TeamRole.MANAGER && ctx.membership.role === TeamRole.MANAGER) {
    throw Errors.forbidden("Only the owner can add managers.");
  }

  const existing = await prisma.advertiserMember.findUnique({
    where: { advertiserId_userId: { advertiserId: ctx.advertiser.id, userId: invitee.id } },
  });
  if (existing) throw Errors.conflict("That user is already a member.", "MEMBER_EXISTS");

  const member = await prisma.advertiserMember.create({
    data: { advertiserId: ctx.advertiser.id, userId: invitee.id, role: input.role },
  });

  await audit({
    userId,
    action: "ADVERTISER.TEAM_ADDED",
    entityType: "AdvertiserMember",
    entityId: member.id,
    meta: { email: invitee.email, role: input.role },
    ip: opts.ip,
  });
  await createNotification({
    userId: invitee.id,
    type: NotificationType.CAMPAIGN,
    title: "Invited to an advertiser team",
    message: `You were added to ${ctx.advertiser.businessName} as ${input.role}.`,
  });
  return member;
}

export async function updateMemberRole(
  userId: string,
  memberId: string,
  role: TeamRole,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, [TeamRole.OWNER]);

  const member = await prisma.advertiserMember.findUnique({ where: { id: memberId } });
  if (!member || member.advertiserId !== ctx.advertiser.id) {
    throw Errors.notFound("Member not found.");
  }
  if (member.userId === ctx.advertiser.userId && role !== TeamRole.OWNER) {
    throw Errors.conflict("The owner cannot change their own role.", "INVALID_STATE");
  }

  const updated = await prisma.advertiserMember.update({
    where: { id: memberId },
    data: { role },
  });

  await audit({
    userId,
    action: "ADVERTISER.TEAM_ROLE_UPDATED",
    entityType: "AdvertiserMember",
    entityId: memberId,
    meta: { role },
    ip: opts.ip,
  });
  return updated;
}

export async function removeMember(
  userId: string,
  memberId: string,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, [TeamRole.OWNER]);

  const member = await prisma.advertiserMember.findUnique({ where: { id: memberId } });
  if (!member || member.advertiserId !== ctx.advertiser.id) {
    throw Errors.notFound("Member not found.");
  }
  if (member.userId === ctx.advertiser.userId) {
    throw Errors.conflict("The owner cannot be removed.", "INVALID_STATE");
  }

  await prisma.advertiserMember.delete({ where: { id: memberId } });
  await audit({
    userId,
    action: "ADVERTISER.TEAM_REMOVED",
    entityType: "AdvertiserMember",
    entityId: memberId,
    meta: { userId: member.userId },
    ip: opts.ip,
  });
}