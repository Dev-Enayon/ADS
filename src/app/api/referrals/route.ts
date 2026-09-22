import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { getReferralSummary } from "@/services/referrals";
import { env } from "@/lib/env";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const summary = await getReferralSummary(user.id);
  const referralLink = summary.referralCode
    ? `${env.appUrl}/register?ref=${summary.referralCode}`
    : null;
  return json({ summary, referralLink });
});