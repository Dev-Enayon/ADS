import Link from "next/link";

import { PageHeader, Panel, EmptyState } from "@/components/advertiser/cards";
import {
  RiskResolvedBadge,
  RiskSeverityBadge,
} from "@/components/admin/badges";
import { getAdminSession } from "@/lib/auth/admin";
import { listRiskEvents, riskSummary } from "@/services/admin/risk";
import { formatDateTime, cn } from "@/lib/utils";
import { ShieldIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RESOLVED_FILTERS = ["", "open", "resolved"] as const;

export default async function AdminRiskPage({ searchParams }: Props) {
  await getAdminSession();
  const sp = await searchParams;
  const page = Math.max(Number(sp.page ?? 1) || 1, 1);
  const resolved =
    typeof sp.resolved === "string"
      ? sp.resolved === "open"
        ? false
        : sp.resolved === "resolved"
          ? true
          : undefined
      : undefined;

  const [data, summary] = await Promise.all([
    listRiskEvents({ page, pageSize: 25, resolved }),
    riskSummary(),
  ]);

  const resolvedTotal = Object.values(summary.resolvedByType).reduce((a, b) => a + b, 0);
  const label = resolved === undefined ? "" : resolved === false ? "open" : "resolved";

  const query = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({ ...(label ? { resolved: label } : {}), ...overrides });

  return (
    <>
      <PageHeader
        title="Risk"
        subtitle={`${summary.unresolved} open events right now.`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel
          title="Open events"
          value={summary.unresolved.toLocaleString()}
          tone={summary.unresolved > 0 ? "danger" : "success"}
          icon={<ShieldIcon size={20} />}
        />
        <Panel title="High" value={(summary.bySeverity.HIGH ?? 0).toLocaleString()} tone={summary.bySeverity.HIGH ? "danger" : "default"} />
        <Panel title="Medium" value={(summary.bySeverity.MEDIUM ?? 0).toLocaleString()} tone={summary.bySeverity.MEDIUM ? "accent" : "default"} />
        <Panel title="Resolved" value={resolvedTotal.toLocaleString()} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Filter:</span>
        {RESOLVED_FILTERS.map((r) => (
          <Link
            key={r || "all"}
            href={`/admin/risk?${query(r ? { resolved: r } : {})}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              (label ?? "") === r
                ? "border-primary bg-primary-faint text-primary-strong"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {r ? (r === "open" ? "Open" : "Resolved") : "All"}
          </Link>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No risk events found" description="Try a different filter." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Severity</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/risk/${e.id}`} className="font-medium text-foreground hover:underline">
                      {e.type.replaceAll("_", " ")}
                    </Link>
                    <p className="truncate text-xs text-muted">{e.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${e.user.id}`} className="text-foreground hover:underline">
                      {e.user.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <RiskSeverityBadge severity={e.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <RiskResolvedBadge resolved={e.resolved} />
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(e.createdAt)}</td>
                  <td className="px-4 py-3 text-muted">
                    {e.resolvedAt ? formatDateTime(e.resolvedAt) : "—"}
                  </td>
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
              <Link href={`/admin/risk?${query({ page: String(data.page - 1) })}`} className="text-primary hover:underline">
                Previous
              </Link>
            )}
            {data.page < data.pages && (
              <Link href={`/admin/risk?${query({ page: String(data.page + 1) })}`} className="text-primary hover:underline">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}