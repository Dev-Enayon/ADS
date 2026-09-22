import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { getAdvertiserAnalytics, getCampaignAnalytics, getDashboardCharts } from "@/services/analytics";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");

  if (campaignId) {
    const analytics = await getCampaignAnalytics(current.advertiser.id, campaignId);
    return json({ analytics });
  }

  const [analytics, charts] = await Promise.all([
    getAdvertiserAnalytics(current.advertiser.id),
    getDashboardCharts(current.advertiser.id),
  ]);
  return json({ analytics, charts });
});