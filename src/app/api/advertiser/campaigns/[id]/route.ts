import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { updateCampaignInputSchema } from "@/schemas/advertiser";
import {
  deleteDraftCampaign,
  getCampaignDetail,
  updateCampaign,
} from "@/services/campaigns";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const campaign = await getCampaignDetail(current.advertiser.id, id);
  return json({ campaign });
});

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = updateCampaignInputSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const campaign = await updateCampaign(current.user.id, id, parsed.data, { ip: ctx.ip });
  return ok({ campaign });
});

export const DELETE = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  await deleteDraftCampaign(current.user.id, id, { ip: ctx.ip });
  return ok({ deleted: true });
});