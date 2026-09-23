import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { riskActionSchema } from "@/schemas/admin";
import { getRiskEventDetail, resolveRiskEvent } from "@/services/admin/risk";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const riskEventId = params?.id;
  if (!riskEventId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const detail = await getRiskEventDetail(riskEventId);
  return json(detail);
});

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const riskEventId = params?.id;
  if (!riskEventId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = riskActionSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  if (parsed.data.action === "resolve") {
    const result = await resolveRiskEvent({
      riskEventId,
      actorId: current.user.id,
      resolution: parsed.data.resolution,
      ip: ctx.ip,
    });
    return ok({ action: "resolved", ...result });
  }
  return json({ error: { code: "VALIDATION_ERROR", message: "Unsupported action." } }, 422);
});