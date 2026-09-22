import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { listMembers } from "@/services/advertisers";
import { PageHeader } from "@/components/advertiser/cards";
import { TeamManager } from "@/components/advertiser/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const members = await listMembers(ctx.advertiser.id);
  const role = ctx.membership.role;
  const canManage = role === "OWNER" || role === "MANAGER";
  const isOwner = role === "OWNER";

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="People who can manage this advertiser account."
      />
      <TeamManager members={members} canManage={canManage} isOwner={isOwner} />
    </>
  );
}