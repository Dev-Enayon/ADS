import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { creativeInputSchema } from "@/schemas/advertiser";
import { updateCreative } from "@/services/creatives";

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const campaignId = params?.id;
  const creativeId = params?.creativeId;
  if (!campaignId || !creativeId) {
    return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
  }

  const body = await readJson<unknown>(req);
  const parsed = creativeInputSchema.partial().safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const creative = await updateCreative(current.user.id, campaignId, creativeId, parsed.data, {
    ip: ctx.ip,
  });
  return ok({ creative });
});