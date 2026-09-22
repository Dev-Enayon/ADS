import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { getDashboardData } from "@/services/campaigns";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const dashboard = await getDashboardData(current.advertiser.id);
  return json({ dashboard });
});