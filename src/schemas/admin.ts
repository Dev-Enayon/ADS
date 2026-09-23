import { z } from "zod";

export const userActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("reactivate"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("setRole"), role: z.enum(["ADMIN", "SUPER_ADMIN"]) }),
]);

export const advertiserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().max(1000).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("suspend"), note: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("reactivate"), note: z.string().max(1000).optional() }),
]);

export const campaignActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("pause"), reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal("resume"), reason: z.string().max(1000).optional() }),
]);

export const withdrawalActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dispatch") }),
  z.object({ action: z.literal("settle"), providerRef: z.string().max(200).optional() }),
  z.object({ action: z.literal("fail"), reason: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("reverse"), reason: z.string().max(1000).optional() }),
]);

export const riskActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve"), resolution: z.string().min(1).max(1000) }),
]);

export const settingUpdateSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string().min(0).max(500),
});