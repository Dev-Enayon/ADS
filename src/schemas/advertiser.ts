import { z } from "zod";

import {
  CampaignObjective,
  CreativeType,
  TeamRole,
} from "@/generated/prisma/enums";

export const idSchema = z.string().min(1).max(128);

export const urlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL.")
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), "Only http(s) URLs are allowed.");

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .optional()
    .or(z.literal("").transform(() => undefined));

const optionalUrl = () =>
  urlSchema.optional().or(z.literal("").transform(() => undefined));

export const createAdvertiserProfileSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required.").max(120),
  businessEmail: z.string().email("Enter a valid business email.").max(200),
  businessPhone: optionalString(30),
  businessDescription: optionalString(1000),
  website: optionalUrl(),
  category: optionalString(80),
  country: optionalString(3),
  state: optionalString(80),
  city: optionalString(80),
  logoUrl: optionalUrl(),
});

export const updateAdvertiserProfileSchema = createAdvertiserProfileSchema.partial();

export const OBJECTIVES = Object.values(CampaignObjective);

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2, "Campaign name is required.").max(120),
  description: optionalString(2000),
  objective: z.enum(OBJECTIVES as [CampaignObjective, ...CampaignObjective[]]),
  // Monetary/completion values are numbers in kobo/counts; the UI sends naira
  // and converts before hitting the API.
  rewardPerCompletion: z
    .number()
    .int()
    .min(1, "Reward must be at least 1 kobo.")
    .max(1_000_000_000, "Reward is too large."),
  maxCompletions: z
    .number()
    .int()
    .min(1, "Target completions must be at least 1.")
    .max(100_000_000, "Target completions is too large."),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  targeting: z
    .object({
      audiences: z.array(z.string().max(80)).max(20).optional(),
      locations: z.array(z.string().max(80)).max(20).optional(),
      genders: z.array(z.enum(["male", "female", "other"])).max(3).optional(),
      ageRange: z
        .object({
          min: z.number().int().min(13).max(100),
          max: z.number().int().min(13).max(100),
        })
        .refine((r) => r.min <= r.max, "Min age cannot exceed max age.")
        .optional(),
    })
    .optional(),
  creative: z
    .object({
      title: z.string().trim().min(2, "Creative title is required.").max(120),
      videoUrl: urlSchema,
      thumbnailUrl: optionalUrl(),
      durationSeconds: z
        .number()
        .int()
        .min(1, "Duration must be at least 1 second.")
        .max(3600),
      ctaText: optionalString(40),
    })
    .optional(),
});

export const updateCampaignInputSchema = campaignInputSchema
  .omit({ creative: true })
  .partial();

export const creativeInputSchema = z.object({
  type: z.enum([CreativeType.VIDEO, CreativeType.OTHER]).default(CreativeType.VIDEO),
  title: z.string().trim().min(2, "Creative title is required.").max(120),
  videoUrl: urlSchema.optional(),
  thumbnailUrl: optionalUrl(),
  durationSeconds: z
    .number()
    .int()
    .min(1, "Duration must be at least 1 second.")
    .max(3600),
  description: optionalString(1000),
  ctaText: optionalString(40),
  mimeType: optionalString(60),
  fileSizeBytes: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const initializeFundingSchema = z.object({
  campaignId: idSchema.optional(),
  amount: z
    .number()
    .int("Amount must be a whole number (kobo).")
    .min(1, "Amount must be greater than zero.")
    .max(100_000_000_000, "Amount is too large."),
  idempotencyKey: z.string().max(200).optional(),
});

export const addMemberSchema = z.object({
  email: z.string().email("Enter a valid email.").max(200),
  role: z.enum([TeamRole.MANAGER, TeamRole.ANALYST]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum([TeamRole.OWNER, TeamRole.MANAGER, TeamRole.ANALYST]),
});

export const campaignListQuerySchema = z.object({
  status: z.string().trim().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["newest", "oldest", "budget", "spend"]).default("newest"),
});