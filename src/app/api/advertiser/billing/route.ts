import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { getBillingSummary } from "@/services/funding";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const summary = await getBillingSummary(current.advertiser.id);
  return json({ billing: summary });
});