import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { getCampaignDetail } from "@/services/campaigns";
import { CampaignEditForm } from "@/components/advertiser/campaign-edit-form";
import { ChevronLeftIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const campaign = await getCampaignDetail(ctx.advertiser.id, id).catch(() => null);
  if (!campaign) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/advertiser/campaigns/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeftIcon size={16} />
        Back to campaign
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-bold tracking-tight text-foreground">Edit campaign</h1>
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <CampaignEditForm
          campaign={{
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            objective: campaign.objective,
            rewardPerCompletion: campaign.rewardPerCompletion,
            maxCompletions: campaign.maxCompletions,
            scheduledStartAt: campaign.startDate,
            endDate: campaign.endDate,
            targeting: campaign.targeting,
          }}
        />
      </div>
    </div>
  );
}