import "server-only";

import { CampaignStatus, CreativeStatus, CreativeType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { campaignRules } from "@/lib/settings";
import { probeVideoUrl } from "@/lib/media/probe";
import {
  requireAdvertiserContext,
  assertRole,
} from "@/lib/auth/advertiser";

export type CreativeInput = {
  type?: CreativeType;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  description?: string;
  ctaText?: string;
  mimeType?: string;
  fileSizeBytes?: number;
};

const VIDEO_MIME_PATTERNS = [
  /^video\//i,
  /^application\/octet-stream$/i,
  /^application\/x-mpegurl$/i,
  /^application\/vnd\.apple\.mpegurl$/i,
];

async function resolveCreativeDuration(
  input: CreativeInput,
): Promise<{ durationSeconds: number; verified: boolean; contentType: string | null }> {
  const rules = await campaignRules();

  let probe = { durationSeconds: null as number | null, verified: false as boolean, contentType: null as string | null };
  if (input.videoUrl && input.type !== CreativeType.OTHER) {
    try {
      probe = await probeVideoUrl(input.videoUrl);
    } catch {
      probe = { durationSeconds: null, verified: false, contentType: null };
    }
  }

  let durationSeconds: number;
  let verified = probe.verified;
  if (probe.verified && probe.durationSeconds !== null) {
    durationSeconds = probe.durationSeconds;
  } else {
    // Fallback to the client-supplied value, but NEVER trust it for
    // accounting: it is clamped to the platform rules and stored as metadata.
    durationSeconds = Math.round(input.durationSeconds);
    verified = false;
  }

  const clamped = Math.min(Math.max(durationSeconds, rules.minVideoSeconds), rules.maxVideoSeconds);
  if (durationSeconds !== clamped) durationSeconds = clamped;

  return { durationSeconds, verified, contentType: probe.contentType };
}

export async function createCreative(
  userId: string,
  campaignId: string,
  input: CreativeInput,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId: ctx.advertiser.id },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.REJECTED) {
    throw Errors.conflict("Creatives can only be added before campaign submission.", "INVALID_STATE");
  }

  const rules = await campaignRules();

  const { durationSeconds, verified, contentType } = await resolveCreativeDuration(input);

  if (input.videoUrl && contentType) {
    const ok = VIDEO_MIME_PATTERNS.some((pattern) => pattern.test(contentType));
    if (!ok && verified) {
      throw Errors.validation("The video URL does not point at a supported video file.");
    }
  }
  if (durationSeconds < rules.minVideoSeconds || durationSeconds > rules.maxVideoSeconds) {
    throw Errors.validation(
      `Video length must be ${rules.minVideoSeconds}-${rules.maxVideoSeconds} seconds. The submitted file cannot be used.`,
    );
  }

  const creative = await prisma.creative.create({
    data: {
      campaignId: campaign.id,
      type: input.type ?? CreativeType.VIDEO,
      videoUrl: input.videoUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      durationSeconds,
      title: input.title,
      description: input.description ?? null,
      ctaText: input.ctaText ?? null,
      mimeType: contentType ?? input.mimeType ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      status: CreativeStatus.ACTIVE,
      meta: { durationVerified: verified },
    },
  });

  await audit({
    userId,
    action: "CREATIVE.CREATED",
    entityType: "Creative",
    entityId: creative.id,
    meta: { campaignId: campaign.id, durationSeconds, durationVerified: verified },
    ip: opts.ip,
  });

  return creative;
}

export async function updateCreative(
  userId: string,
  campaignId: string,
  creativeId: string,
  patch: Partial<CreativeInput>,
  opts: { ip?: string | null } = {},
) {
  const ctx = await requireAdvertiserContext(userId);
  assertRole(ctx, ["OWNER", "MANAGER"]);

  const creative = await prisma.creative.findFirst({
    where: { id: creativeId, campaignId, campaign: { advertiserId: ctx.advertiser.id } },
  });
  if (!creative) throw Errors.notFound("Creative not found.");

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, advertiserId: ctx.advertiser.id },
  });
  if (!campaign) throw Errors.notFound("Campaign not found.");
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.REJECTED) {
    throw Errors.conflict("Creatives can only be edited before campaign submission.", "INVALID_STATE");
  }

  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.ctaText !== undefined) data.ctaText = patch.ctaText || null;
  if (patch.thumbnailUrl !== undefined) data.thumbnailUrl = patch.thumbnailUrl || null;
  if (patch.videoUrl !== undefined) {
    data.videoUrl = patch.videoUrl || null;
  }
  if (patch.durationSeconds !== undefined || patch.videoUrl !== undefined) {
    const resolved = await resolveCreativeDuration({ ...creative, ...patch } as CreativeInput);
    data.durationSeconds = resolved.durationSeconds;
    data.meta = { durationVerified: resolved.verified };
    if (resolved.contentType) data.mimeType = resolved.contentType;
  }
  if (patch.fileSizeBytes !== undefined) data.fileSizeBytes = patch.fileSizeBytes;

  const updated = await prisma.creative.update({
    where: { id: creative.id },
    data: data as never,
  });

  await audit({
    userId,
    action: "CREATIVE.UPDATED",
    entityType: "Creative",
    entityId: creative.id,
    meta: { campaignId },
    ip: opts.ip,
  });
  return updated;
}

export async function listCreativesForAdvertiser(
  advertiserId: string,
  opts: { q?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 24, 1), 100);

  const where = {
    campaign: { advertiserId },
    ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" as const } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.creative.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { campaign: { select: { id: true, name: true } } },
    }),
    prisma.creative.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}