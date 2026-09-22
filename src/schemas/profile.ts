import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(100)
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number.")
    .optional()
    .or(z.literal("")),
  country: z
    .string()
    .trim()
    .min(2, "Country must be at least 2 characters.")
    .max(64)
    .optional()
    .or(z.literal("")),
  state: z
    .string()
    .trim()
    .min(2, "State must be at least 2 characters.")
    .max(64)
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .trim()
    .min(2, "City must be at least 2 characters.")
    .max(64)
    .optional()
    .or(z.literal("")),
});

export const updateAvatarSchema = z.object({
  dataUrl: z.string().max(3_000_000).optional(),
});