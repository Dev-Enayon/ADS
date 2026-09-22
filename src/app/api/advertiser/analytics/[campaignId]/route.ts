import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { getCampaignAnalytics } from "@/services/analytics";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const id = params?.campaignId;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const analytics = await getCampaignAnalytics(current.advertiser.id, id);
  return json({ analytics });
});