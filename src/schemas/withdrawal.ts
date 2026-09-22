import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";

export const paymentMethodEnum = z.nativeEnum(PaymentMethod);

export const paymentDetailsSchema = z
  .object({
    accountName: z.string().trim().min(2).max(100).optional(),
    accountNumber: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit account number.").optional(),
    bankName: z.string().trim().min(2).max(100).optional(),
    phoneNumber: z.string().trim().min(7).max(20).optional(),
    walletAddress: z.string().trim().min(5).max(120).optional(),
  })
  .superRefine((value, ctx) => {
    const filled = Object.values(value).filter(
      (v): v is string => v !== undefined && v !== "",
    ).length;
    if (filled === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Provide at least one payout detail.",
        path: [],
      });
    }
  });

export const createWithdrawalSchema = z.object({
  amount: z
    .number()
    .positive("Enter a valid amount.")
    .max(100_000_000, "Amount is too large.")
    .transform((v) => Math.round(v * 100)), // naira -> kobo
  paymentMethod: paymentMethodEnum,
  paymentDetails: paymentDetailsSchema,
  idempotencyKey: z
    .string()
    .trim()
    .max(64)
    .optional()
    .or(z.literal("")),
});