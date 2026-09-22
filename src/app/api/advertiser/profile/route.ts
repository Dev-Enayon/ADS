import { created, json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { getAdvertiserContext, requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { requireUserFromRequest } from "@/lib/auth/session";
import {
  createAdvertiserProfileSchema,
  updateAdvertiserProfileSchema,
} from "@/schemas/advertiser";
import {
  createAdvertiserProfile,
  getAdvertiserOwnProfile,
  updateAdvertiserProfile,
} from "@/services/advertisers";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const profile = await getAdvertiserOwnProfile(current.user.id);
  return json({ advertiser: profile });
});

export const POST = route({}, async (req, ctx) => {
  const { user } = await requireUserFromRequest(req);

  const existing = await getAdvertiserContext(user.id);
  if (existing) {
    return json({ error: { code: "ADVERTISER_EXISTS", message: "You already have an advertiser account." } }, 409);
  }

  const body = await readJson<unknown>(req);
  const parsed = createAdvertiserProfileSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const advertiser = await createAdvertiserProfile(user.id, parsed.data, {
    ip: ctx.ip,
  });
  return created({ advertiser });
});

export const PATCH = route({}, async (req, ctx) => {
  const current = await requireAdvertiserFromRequest(req);
  const body = await readJson<unknown>(req);
  const parsed = updateAdvertiserProfileSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const advertiser = await updateAdvertiserProfile(current.user.id, parsed.data, {
    ip: ctx.ip,
  });
  return ok({ advertiser });
});