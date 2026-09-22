import { z } from "zod";

export const idSchema = z.string().min(1).max(128);

export const startWatchSchema = z.object({
  opportunityId: idSchema,
});

export const heartbeatSchema = z.object({
  watchedSeconds: z
    .number()
    .int("Progress must be a whole number of seconds.")
    .min(0)
    .max(86400),
});

export const completeWatchSchema = z.object({
  // No client-controlled fields: everything is resolved server-side.
});