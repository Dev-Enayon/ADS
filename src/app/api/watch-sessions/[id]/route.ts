import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/db";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) throw Errors.badRequest("Missing session id.");

  const { user } = await requireUserFromRequest(req);
  const session = await prisma.watchSession.findFirst({
    where: { id, userId: user.id },
  });
  if (!session) throw Errors.notFound("Watch session not found.");
  return json({ session });
});