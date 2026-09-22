import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { getCampaignDetail } from "@/services/campaigns";
import { getCampaignAnalytics } from "@/services/analytics";
import { CampaignActions } from "@/components/advertiser/campaign-actions";
import { CreativeForm } from "@/components/advertiser/creative-form";
import { CampaignStatusBadge } from "@/components/advertiser/status";
import { Panel, ProgressBar } from "@/components/advertiser/cards";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
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

  const analytics = await getCampaignAnalytics(ctx.advertiser.id, id);
  const canManage = ctx.membership.role === "OWNER" || ctx.membership.role === "MANAGER";
  const editable = campaign.status === "DRAFT" || campaign.status === "REJECTED";

  const spendPercent =
    campaign.allocatedAmount > 0
      ? Math.round((campaign.spentAmount / campaign.allocatedAmount) * 100)
      : 0;
  const fillRate =
    campaign.maxCompletions > 0
      ? Math.round((campaign.currentCompletions / campaign.maxCompletions) * 100)
      : 0;

  const opp = campaign.opportunities[0] ?? null;

  return (
    <>
      <Link
        href="/advertiser/campaigns"
        className="mb-3 inline-flex text-sm text-muted hover:text-foreground"
      >
        ← Back to campaigns
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              {campaign.name}
            </h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {campaign.objective.replace(/_/g, " ").toLowerCase()} · created{" "}
            {new Date(campaign.createdAt).toLocaleDateString()}
          </p>
        </div>
        <CampaignActions campaignId={campaign.id} status={campaign.status} canManage={canManage} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Budget" value={formatMoney(campaign.budget)} sub={`Spent ${formatMoney(campaign.spentAmount)}`} />
        <Panel title="Allocated" value={formatMoney(campaign.allocatedAmount)} sub={`Remaining ${formatMoney(campaign.remainingBudget)}`} />
        <Panel title="Completions" value={`${campaign.currentCompletions.toLocaleString()} / ${campaign.maxCompletions.toLocaleString()}`} sub={`${fillRate}% of target`} />
        <Panel title="Started views" value={campaign.startedViews.toLocaleString()} sub={`${campaign.completedViews.toLocaleString()} completed`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Performance</h2>
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span>Budget spent</span>
              <span className="font-semibold text-foreground">{spendPercent}%</span>
            </div>
            <ProgressBar value={spendPercent} tone="success" />
            <div className="mt-4 mb-1.5 flex justify-between text-xs text-muted">
              <span>Completion target</span>
              <span className="font-semibold text-foreground">{fillRate}%</span>
            </div>
            <ProgressBar value={fillRate} tone={fillRate >= 100 ? "success" : "primary"} />

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted">Reward / completion</dt>
                <dd className="mt-1 text-lg font-bold text-foreground">{formatMoney(campaign.rewardPerCompletion)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted">Rewards granted</dt>
                <dd className="mt-1 text-lg font-bold text-foreground">
                  {formatMoney((analytics.rewards as { totalValueGranted?: number }).totalValueGranted ?? 0)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Creatives</h2>
            {campaign.creatives.length === 0 ? (
              <p className="text-sm text-muted">No creatives yet. Add one before submitting for review.</p>
            ) : (
              <ul className="space-y-2">
                {campaign.creatives.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-muted p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
                      <p className="truncate text-xs text-muted">{c.videoUrl}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted">
                      {c.durationSeconds}s · {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {editable && <CreativeForm campaignId={campaign.id} />}
          </div>
        </section>

        <section className="space-y-4">
          {campaign.description && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-muted">{campaign.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Schedule</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Starts</dt>
                <dd className="font-medium text-foreground">
                  {campaign.startDate ? new Date(campaign.startDate).toLocaleString() : "On approval"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Ends</dt>
                <dd className="font-medium text-foreground">
                  {campaign.endDate ? new Date(campaign.endDate).toLocaleString() : "No end date"}
                </dd>
              </div>
            </dl>
          </div>

          {opp && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Feed listing</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Visibility</dt>
                  <dd className="font-medium text-foreground">{opp.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Completions</dt>
                  <dd className="font-medium text-foreground">
                    {opp.currentCompletions.toLocaleString()} / {(opp.maxCompletions ?? 0).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Targeting</h2>
            {campaign.targeting && Object.keys(campaign.targeting as object).length > 0 ? (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted">
                {JSON.stringify(campaign.targeting, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted">No targeting configured (shown to everyone).</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}