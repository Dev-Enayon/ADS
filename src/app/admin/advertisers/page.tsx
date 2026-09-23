import Link from "next/link";

import { PageHeader, EmptyState } from "@/components/advertiser/cards";
import { AdvertiserStatusBadge } from "@/components/admin/badges";
import { getAdminSession } from "@/lib/auth/admin";
import { listAdvertisers } from "@/services/admin/advertisers";
import { formatMoney } from "@/lib/money";
import { formatDateTime, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_FILTERS = ["", "PENDING", "ACTIVE", "SUSPENDED", "REJECTED"] as const;

export default async function AdminAdvertisersPage({ searchParams }: Props) {
  await getAdminSession();
  const sp = await searchParams;
  const page = Math.max(Number(sp.page ?? 1) || 1, 1);
  const status = typeof sp.status === "string" ? sp.status : "";
  const search = typeof sp.search === "string" && sp.search ? sp.search : undefined;

  const data = await listAdvertisers({
    page,
    pageSize: 25,
    status: status || undefined,
    search,
  });

  const query = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({ ...(status ? { status } : {}), ...overrides });

  return (
    <>
      <PageHeader title="Advertisers" subtitle={`${data.total.toLocaleString()} advertiser accounts.`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Status:</span>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s || "all"}
            href={`/admin/advertisers?${query(s ? { status: s } : {})}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              status === s
                ? "border-primary bg-primary-faint text-primary-strong"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {s || "All"}
          </Link>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No advertisers found" description="Try a different filter." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
                <th className="px-4 py-3 font-semibold">Business</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Wallet</th>
                <th className="px-4 py-3 font-semibold">Campaigns</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/advertisers/${a.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {a.businessName}
                    </Link>
                    <p className="text-xs text-muted">{a.businessEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <AdvertiserStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">{a.wallet ? formatMoney(a.wallet.availableBalance) : "—"}</td>
                  <td className="px-4 py-3 text-muted">{a.campaigns.length}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(a.createdAt)}</td>
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
                href={`/admin/advertisers?${query({ page: String(data.page - 1) })}`}
                className="text-primary hover:underline"
              >
                Previous
              </Link>
            )}
            {data.page < data.pages && (
              <Link
                href={`/admin/advertisers?${query({ page: String(data.page + 1) })}`}
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