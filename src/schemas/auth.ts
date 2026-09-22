import { z } from "zod";

export const registerSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be at most 128 characters."),
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(100)
    .optional()
    .or(z.literal("")),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^RH[A-Z0-9]{8}$/, "That referral code is not valid.")
    .optional()
    .or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "The reset token is invalid.").max(256),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(128),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20, "The verification token is invalid.").max(256),
});

export const resendVerificationSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
});