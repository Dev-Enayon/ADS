import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminSession } from "@/lib/auth/admin";
import { getAdvertiserDetail } from "@/services/admin/advertisers";
import { PageHeader } from "@/components/advertiser/cards";
import { AdvertiserStatusBadge, CampaignStatusBadge } from "@/components/admin/badges";
import { AdminActionButton } from "@/components/admin/actions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import {
  BanknoteIcon,
  BuildingIcon,
  ChevronLeftIcon,
  LayersIcon,
  UsersIcon,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminAdvertiserDetailPage({ params }: Props) {
  await getAdminSession();
  const { id } = await params;

  let advertiser;
  try {
    advertiser = await getAdvertiserDetail(id);
  } catch {
    notFound();
  }

  const status = advertiser.status;

  return (
    <>
      <Link
        href="/admin/advertisers"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
      >
        <ChevronLeftIcon size={14} /> Advertisers
      </Link>
      <PageHeader
        title={advertiser.businessName}
        subtitle={advertiser.businessEmail}
        actions={<AdvertiserStatusBadge status={status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Business</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-muted">Category</dt>
                <dd className="font-medium">{advertiser.category ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Phone</dt>
                <dd className="font-medium">{advertiser.businessPhone ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Website</dt>
                <dd className="font-medium">
                  {advertiser.website ? (
                    <a href={advertiser.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {advertiser.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Location</dt>
                <dd className="font-medium">
                  {[advertiser.city, advertiser.state, advertiser.country].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
            </dl>
            {advertiser.businessDescription && (
              <p className="mt-3 border-t border-border pt-3 text-muted">{advertiser.businessDescription}</p>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex justify-between">
                <dt className="text-muted">Owner</dt>
                <dd className="font-medium">
                  <Link href={`/admin/users/${advertiser.user.id}`} className="text-primary hover:underline">
                    {advertiser.user.email}
                  </Link>
                </dd>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <UsersIcon size={14} /> Team members
            </p>
            {advertiser.members.length === 0 ? (
              <p className="mt-3 text-muted">No team members yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {advertiser.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="font-medium text-foreground">{m.user.email}</span>
                    <span className="text-xs text-muted">{m.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <LayersIcon size={14} /> Campaigns
            </p>
            {advertiser.campaigns.length === 0 ? (
              <p className="mt-3 text-muted">No campaigns yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {advertiser.campaigns.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/campaigns/${c.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:underline"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted">{c._count.opportunities} opportunities</p>
                      </div>
                      <CampaignStatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <BanknoteIcon size={14} /> Wallet
            </p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Available</dt>
                <dd className="font-medium text-foreground">{formatMoney(advertiser.wallet?.availableBalance ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total funded</dt>
                <dd className="font-medium text-foreground">{formatMoney(advertiser.wallet?.totalFunded ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total spent</dt>
                <dd className="font-medium text-foreground">{formatMoney(advertiser.wallet?.totalSpent ?? 0)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <BuildingIcon size={14} /> Review
            </p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">
                  <AdvertiserStatusBadge status={status} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Reviewed</dt>
                <dd className="font-medium">{advertiser.reviewedAt ? formatDateTime(advertiser.reviewedAt) : "Pending"}</dd>
              </div>
              {advertiser.reviewedBy && (
                <div className="flex justify-between">
                  <dt className="text-muted">Reviewed by</dt>
                  <dd className="font-medium">{advertiser.reviewedBy.email}</dd>
                </div>
              )}
              {advertiser.rejectionReason && (
                <p className="rounded-xl bg-danger-soft/60 p-3 text-xs text-danger">{advertiser.rejectionReason}</p>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(status === "PENDING" || status === "REJECTED") && (
                <>
                  <AdminActionButton
                    url={`/api/admin/advertisers/${advertiser.id}`}
                    payload={{ action: "approve" }}
                    label="Approve"
                    variant="primary"
                    successMessage="Advertiser approved"
                  />
                  {status === "PENDING" && (
                    <AdminActionButton
                      url={`/api/admin/advertisers/${advertiser.id}`}
                      payload={{ action: "reject", note: "Rejected from the admin console." }}
                      label="Reject"
                      variant="danger"
                      confirm="Reject this advertiser account?"
                      successMessage="Advertiser rejected"
                    />
                  )}
                </>
              )}
              {status === "ACTIVE" && (
                <AdminActionButton
                  url={`/api/admin/advertisers/${advertiser.id}`}
                  payload={{ action: "suspend", note: "Suspended from the admin console." }}
                  label="Suspend"
                  variant="danger"
                  confirm="Suspend this advertiser and pause their live campaigns?"
                  successMessage="Advertiser suspended"
                />
              )}
              {status === "SUSPENDED" && (
                <AdminActionButton
                  url={`/api/admin/advertisers/${advertiser.id}`}
                  payload={{ action: "reactivate" }}
                  label="Reactivate"
                  variant="primary"
                  successMessage="Advertiser reactivated"
                />
              )}
            </div>
            {status === "PENDING" && (
              <p className="mt-3 text-xs text-muted">Approving lets this advertiser go live immediately.</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}