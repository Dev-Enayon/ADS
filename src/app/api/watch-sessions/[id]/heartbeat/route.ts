import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { heartbeatSchema } from "@/schemas/watch";
import { heartbeatWatchSession } from "@/services/watch";

export const POST = route({ originCheck: true }, async (req, _ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) throw Errors.badRequest("Missing session id.");

  const body = await readJson(req);
  if (!body) throw Errors.badRequest("Invalid request body.");
  const { watchedSeconds } = heartbeatSchema.parse(body);

  const { user } = await requireUserFromRequest(req);
  const result = await heartbeatWatchSession({
    userId: user.id,
    watchSessionId: id,
    watchedSeconds,
  });

  return json(result);
});