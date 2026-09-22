import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { startWatchSchema } from "@/schemas/watch";
import { startWatchSession } from "@/services/watch";

export const POST = route({ originCheck: true }, async (req, ctx) => {
  const body = await readJson(req);
  if (!body) throw Errors.badRequest("Invalid request body.");
  const { opportunityId } = startWatchSchema.parse(body);

  const { user } = await requireUserFromRequest(req);
  const session = await startWatchSession({
    userId: user.id,
    opportunityId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return json({ session });
});