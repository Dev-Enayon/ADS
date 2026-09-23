import Link from "next/link";

import { PageHeader, EmptyState } from "@/components/advertiser/cards";
import { CampaignStatusBadge } from "@/components/admin/badges";
import { getAdminSession } from "@/lib/auth/admin";
import { listCampaigns } from "@/services/admin/campaigns";
import { formatMoney } from "@/lib/money";
import { formatDateTime, cn } from "@/lib/utils";
import { CampaignStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_FILTERS = [
  "",
  CampaignStatus.DRAFT,
  CampaignStatus.PENDING_REVIEW,
  CampaignStatus.APPROVED,
  CampaignStatus.SCHEDULED,
  CampaignStatus.ACTIVE,
  CampaignStatus.PAUSED,
  CampaignStatus.COMPLETED,
  CampaignStatus.REJECTED,
  CampaignStatus.EXPIRED,
  CampaignStatus.CANCELLED,
] as const;

export default async function AdminCampaignsPage({ searchParams }: Props) {
  await getAdminSession();
  const sp = await searchParams;
  const page = Math.max(Number(sp.page ?? 1) || 1, 1);
  const status = typeof sp.status === "string" ? sp.status : "";
  const search = typeof sp.search === "string" && sp.search ? sp.search : undefined;

  const data = await listCampaigns({
    page,
    pageSize: 25,
    status: status || undefined,
    search,
  });

  const query = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({ ...(status ? { status } : {}), ...overrides });

  return (
    <>
      <PageHeader title="Campaigns" subtitle={`${data.total.toLocaleString()} campaigns.`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Status:</span>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s || "all"}
            href={`/admin/campaigns?${query(s ? { status: s } : {})}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              status === s
                ? "border-primary bg-primary-faint text-primary-strong"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {s ? s.replace("_", " ") : "All"}
          </Link>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No campaigns found" description="Try a different filter." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
                <th className="px-4 py-3 font-semibold">Campaign</th>
                <th className="px-4 py-3 font-semibold">Advertiser</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Reward</th>
                <th className="px-4 py-3 font-semibold">Completions</th>
                <th className="px-4 py-3 font-semibold">Spent</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/campaigns/${c.id}`} className="font-medium text-foreground hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {c._count.opportunities} ops · {c._count.creatives} creatives
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/advertisers/${c.advertiser.id}`}
                      className="text-foreground hover:underline"
                    >
                      {c.advertiser.businessName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">{formatMoney(c.rewardPerCompletion)}</td>
                  <td className="px-4 py-3 text-muted">
                    {c.currentCompletions}/{c.maxCompletions}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatMoney(c.spentAmount)}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link
                href={`/admin/campaigns?${query({ page: String(data.page - 1) })}`}
                className="text-primary hover:underline"
              >
                Previous
              </Link>
            )}
            {data.page < data.pages && (
              <Link
                href={`/admin/campaigns?${query({ page: String(data.page + 1) })}`}
                className="text-primary hover:underline"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}