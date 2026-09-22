import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { updateMemberRoleSchema } from "@/schemas/advertiser";
import { removeMember, updateMemberRole } from "@/services/advertisers";

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const memberId = params?.memberId;
  if (!memberId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = updateMemberRoleSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const member = await updateMemberRole(current.user.id, memberId, parsed.data.role, { ip: ctx.ip });
  return ok({ member });
});

export const DELETE = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const memberId = params?.memberId;
  if (!memberId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  await removeMember(current.user.id, memberId, { ip: ctx.ip });
  return ok({ removed: true });
});