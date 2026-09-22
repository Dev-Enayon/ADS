import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { getReferralSummary } from "@/services/referrals";
import { env } from "@/lib/env";
import { ReferralsView } from "@/components/referrals/referrals-view";

export const metadata: Metadata = { title: "Referrals" };

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const summary = await getReferralSummary(user.id);
  const referralLink = summary.referralCode
    ? `${env.appUrl}/register?ref=${summary.referralCode}`
    : null;

  return (
    <ReferralsView
      referralCode={summary.referralCode}
      referralLink={referralLink}
      totalInvites={summary.totalInvites}
      completedInvites={summary.completedInvites}
      pendingInvites={summary.pendingInvites}
      totalRewarded={summary.totalRewarded}
      invites={summary.invites}
    />
  );
}