import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { advertiserActionSchema } from "@/schemas/admin";
import {
  approveAdvertiser,
  getAdvertiserDetail,
  reactivateAdvertiser,
  rejectAdvertiser,
  suspendAdvertiser,
} from "@/services/admin/advertisers";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const advertiserId = params?.id;
  if (!advertiserId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const detail = await getAdvertiserDetail(advertiserId);
  return json(detail);
});

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const advertiserId = params?.id;
  if (!advertiserId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = advertiserActionSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  switch (parsed.data.action) {
    case "approve": {
      await approveAdvertiser({
        advertiserId,
        actorId: current.user.id,
        note: parsed.data.note,
        ip: ctx.ip,
      });
      return ok({ action: "approved" });
    }
    case "reject": {
      await rejectAdvertiser({
        advertiserId,
        actorId: current.user.id,
        note: parsed.data.note,
        ip: ctx.ip,
      });
      return ok({ action: "rejected" });
    }
    case "suspend": {
      await suspendAdvertiser({
        advertiserId,
        actorId: current.user.id,
        note: parsed.data.note,
        ip: ctx.ip,
      });
      return ok({ action: "suspended" });
    }
    case "reactivate": {
      await reactivateAdvertiser({
        advertiserId,
        actorId: current.user.id,
        note: parsed.data.note,
        ip: ctx.ip,
      });
      return ok({ action: "reactivated" });
    }
  }
});