import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import {
  requireAdminFromRequest,
  requireSuperAdminFromRequest,
} from "@/lib/auth/admin";
import { userActionSchema } from "@/schemas/admin";
import { getUserDetail, reactivateUser, setUserRole, suspendUser } from "@/services/admin/users";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const userId = params?.id;
  if (!userId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const user = await getUserDetail(userId);
  return json(user);
});

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const userId = params?.id;
  if (!userId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = userActionSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  switch (parsed.data.action) {
    case "suspend": {
      await suspendUser({
        userId,
        actorId: current.user.id,
        reason: parsed.data.reason ?? "Suspended by an administrator.",
        ip: ctx.ip,
      });
      return ok({ action: "suspended" });
    }
    case "reactivate": {
      await reactivateUser({ userId, actorId: current.user.id, ip: ctx.ip });
      return ok({ action: "reactivated" });
    }
    case "setRole": {
      await requireSuperAdminFromRequest(req);
      const updated = await setUserRole({
        userId,
        actorId: current.user.id,
        role: parsed.data.role,
        ip: ctx.ip,
      });
      return ok({ action: "role_changed", user: updated });
    }
  }
});