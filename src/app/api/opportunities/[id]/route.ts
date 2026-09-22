import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { getOpportunityById } from "@/services/opportunities";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  await requireUserFromRequest(req);
  const opportunity = await getOpportunityById(id);
  return json({ opportunity });
});