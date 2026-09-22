import { json, ok } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { verifyFunding } from "@/services/funding";

export const POST = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const verification = await verifyFunding(current.user.id, id, { ip: ctx.ip });
  return ok(verification);
});