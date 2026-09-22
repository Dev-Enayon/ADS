import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/db";

export const DELETE = route({ originCheck: true }, async (req, _ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) throw Errors.badRequest("Missing session id.");

  const { user, sessionId } = await requireUserFromRequest(req);
  if (id === sessionId) {
    throw Errors.badRequest("Use logout to end the current session.", "CURRENT_SESSION");
  }

  const result = await prisma.session.updateMany({
    where: { id, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) throw Errors.notFound("Session not found.");
  return json({ ok: true });
});