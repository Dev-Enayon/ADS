import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { completeWatchSession } from "@/services/watch";

export const POST = route({ originCheck: true }, async (req, ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) throw Errors.badRequest("Missing session id.");

  const { user } = await requireUserFromRequest(req);
  const result = await completeWatchSession({
    userId: user.id,
    watchSessionId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return json({ reward: result.reward });
});