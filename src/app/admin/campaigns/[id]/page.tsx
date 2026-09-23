import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminSession } from "@/lib/auth/admin";
import { getCampaignDetail } from "@/services/admin/campaigns";
import { PageHeader, ProgressBar } from "@/components/advertiser/cards";
import { CampaignStatusBadge } from "@/components/admin/badges";
import { AdminActionButton } from "@/components/admin/actions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import {
  BanknoteIcon,
  BuildingIcon,
  ChevronLeftIcon,
  PlayIcon,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminCampaignDetailPage({ params }: Props) {
  await getAdminSession();
  const { id } = await params;

  let campaign;
  try {
    campaign = await getCampaignDetail(id);
  } catch {
    notFound();
  }

  const status = campaign.status;
  const completionsPct =
    campaign.maxCompletions > 0
      ? (campaign.currentCompletions / campaign.maxCompletions) * 100
      : 0;

  return (
    <>
      <Link
        href="/admin/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
      >
        <ChevronLeftIcon size={14} /> Campaigns
      </Link>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.objective.replace("_", " ")}
        actions={<CampaignStatusBadge status={status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Campaign</p>
            {campaign.description && <p className="mt-3 text-muted">{campaign.description}</p>}
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-muted">Objective</dt>
                <dd className="font-medium">{campaign.objective.replace("_", " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Reward per completion</dt>
                <dd className="font-medium">{formatMoney(campaign.rewardPerCompletion)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Start</dt>
                <dd className="font-medium">{campaign.startDate ? formatDateTime(campaign.startDate) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">End</dt>
                <dd className="font-medium">{campaign.endDate ? formatDateTime(campaign.endDate) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Launched</dt>
                <dd className="font-medium">{campaign.startedAt ? formatDateTime(campaign.startedAt) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="font-medium">{formatDateTime(campaign.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <BanknoteIcon size={14} /> Budget
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-muted">Planned budget</dt>
                <dd className="font-medium">{formatMoney(campaign.budget)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Allocated</dt>
                <dd className="font-medium">{formatMoney(campaign.allocatedAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Remaining</dt>
                <dd className="font-medium">{formatMoney(campaign.remainingBudget)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Spent</dt>
                <dd className="font-medium">{formatMoney(campaign.spentAmount)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span>Completions</span>
                <span>
                  {campaign.currentCompletions}/{campaign.maxCompletions}
                </span>
              </div>
              <ProgressBar value={completionsPct} />
              <p className="mt-1.5 text-xs text-muted">
                {campaign.startedViews} views started · {campaign.completedViews} views completed
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <PlayIcon size={14} /> Opportunities
            </p>
            {campaign.opportunities.length === 0 ? (
              <p className="mt-3 text-muted">No opportunities linked.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {campaign.opportunities.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{o.title}</p>
                      <p className="text-xs text-muted">
                        {o.type} · {o.durationSeconds}s · {formatMoney(o.rewardAmount)}
                      </p>
                    </div>
                    <span className="text-xs text-muted">{o.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {campaign.creatives.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Creatives</p>
              <ul className="mt-3 divide-y divide-border">
                {campaign.creatives.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{c.title}</p>
                      <p className="text-xs text-muted">{c.type} · {c.durationSeconds}s</p>
                    </div>
                    <span className="text-xs text-muted">{c.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {campaign.fundingRecords.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Funding</p>
              <ul className="mt-3 divide-y divide-border">
                {campaign.fundingRecords.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{formatMoney(f.amount)}</p>
                      <p className="text-xs text-muted">
                        {f.reference} · {f.provider}
                        {f.providerRef ? ` · ${f.providerRef}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted">{f.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <BuildingIcon size={14} /> Advertiser
            </p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Business</dt>
                <dd className="font-medium">
                  <Link href={`/admin/advertisers/${campaign.advertiser.id}`} className="text-primary hover:underline">
                    {campaign.advertiser.businessName}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Email</dt>
                <dd className="font-medium">{campaign.advertiser.user.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Wallet</dt>
                <dd className="font-medium">{formatMoney(campaign.advertiser.wallet?.availableBalance ?? 0)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Review</p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">
                  <CampaignStatusBadge status={status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Reviewed</dt>
                <dd className="font-medium">{campaign.reviewedAt ? formatDateTime(campaign.reviewedAt) : "Pending"}</dd>
              </div>
              {campaign.reviewedBy && (
                <div className="flex justify-between">
                  <dt className="text-muted">Reviewed by</dt>
                  <dd className="font-medium">{campaign.reviewedBy.email}</dd>
                </div>
              )}
              {campaign.rejectionReason && (
                <p className="rounded-xl bg-danger-soft/60 p-3 text-xs text-danger">{campaign.rejectionReason}</p>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {status === "PENDING_REVIEW" && (
                <>
                  <AdminActionButton
                    url={`/api/admin/campaigns/${campaign.id}`}
                    payload={{ action: "approve" }}
                    label="Approve"
                    variant="primary"
                    successMessage="Campaign approved"
                  />
                  <AdminActionButton
                    url={`/api/admin/campaigns/${campaign.id}`}
                    payload={{ action: "reject", reason: "Rejected by an administrator." }}
                    label="Reject"
                    variant="danger"
                    confirm="Reject this campaign?"
                    successMessage="Campaign rejected"
                  />
                </>
              )}
              {(status === "APPROVED" || status === "SCHEDULED" || status === "ACTIVE") && (
                <AdminActionButton
                  url={`/api/admin/campaigns/${campaign.id}`}
                  payload={{ action: "pause" }}
                  label="Pause"
                  variant="outline"
                  confirm="Pause this campaign? Its opportunities will stop being shown."
                  successMessage="Campaign paused"
                />
              )}
              {status === "PAUSED" && (
                <AdminActionButton
                  url={`/api/admin/campaigns/${campaign.id}`}
                  payload={{ action: "resume" }}
                  label="Resume"
                  variant="primary"
                  successMessage="Campaign resumed"
                />
              )}
            </div>
            {status === "PENDING_REVIEW" && (
              <p className="mt-3 text-xs text-muted">Approving activates the campaign once it meets review rules.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}