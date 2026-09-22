import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { markNotificationRead } from "@/services/notifications";

export const POST = route({ originCheck: true }, async (req, _ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) throw Errors.badRequest("Missing notification id.");

  const { user } = await requireUserFromRequest(req);
  const marked = await markNotificationRead(user.id, id);
  if (!marked) throw Errors.notFound("Notification not found.");
  return json({ ok: true });
});