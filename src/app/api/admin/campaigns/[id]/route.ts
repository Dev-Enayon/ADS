import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { campaignActionSchema } from "@/schemas/admin";
import {
  getCampaignDetail,
  moderateCampaign,
  pauseCampaignAdmin,
  resumeCampaignAdmin,
} from "@/services/admin/campaigns";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const campaignId = params?.id;
  if (!campaignId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const detail = await getCampaignDetail(campaignId);
  return json(detail);
});

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const campaignId = params?.id;
  if (!campaignId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = campaignActionSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  switch (parsed.data.action) {
    case "approve":
    case "reject": {
      await moderateCampaign({
        campaignId,
        action: parsed.data.action,
        actorId: current.user.id,
        reason: parsed.data.reason,
        ip: ctx.ip,
      });
      return ok({ action: parsed.data.action === "approve" ? "approved" : "rejected" });
    }
    case "pause": {
      await pauseCampaignAdmin({
        campaignId,
        actorId: current.user.id,
        reason: parsed.data.reason,
        ip: ctx.ip,
      });
      return ok({ action: "paused" });
    }
    case "resume": {
      await resumeCampaignAdmin({
        campaignId,
        actorId: current.user.id,
        reason: parsed.data.reason,
        ip: ctx.ip,
      });
      return ok({ action: "resumed" });
    }
  }
});