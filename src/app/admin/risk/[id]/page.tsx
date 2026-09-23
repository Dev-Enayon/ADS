import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminSession } from "@/lib/auth/admin";
import { getRiskEventDetail } from "@/services/admin/risk";
import { PageHeader } from "@/components/advertiser/cards";
import { RiskResolvedBadge, RiskSeverityBadge } from "@/components/admin/badges";
import { RiskResolveForm } from "@/components/admin/actions";
import { formatDateTime } from "@/lib/utils";
import { ChevronLeftIcon, ShieldIcon, UserIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminRiskDetailPage({ params }: Props) {
  await getAdminSession();
  const { id } = await params;

  let event;
  try {
    event = await getRiskEventDetail(id);
  } catch {
    notFound();
  }

  return (
    <>
      <Link
        href="/admin/risk"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
      >
        <ChevronLeftIcon size={14} /> Risk
      </Link>
      <PageHeader
        title={event.type.replaceAll("_", " ")}
        subtitle={`${event.severity} severity · ${event.resolved ? "resolved" : "open"}`}
        actions={
          <div className="flex gap-2">
            <RiskSeverityBadge severity={event.severity} />
            <RiskResolvedBadge resolved={event.resolved} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <ShieldIcon size={14} /> Details
            </p>
            <p className="mt-3 text-muted">{event.description}</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-muted">Type</dt>
                <dd className="font-medium">{event.type.replaceAll("_", " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Severity</dt>
                <dd className="font-medium">{event.severity}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Entity</dt>
                <dd className="font-medium">
                  {event.entityType ? `${event.entityType} · ${event.entityId ?? "—"}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="font-medium">{formatDateTime(event.createdAt)}</dd>
              </div>
              {event.ipAddress && (
                <div className="flex justify-between">
                  <dt className="text-muted">IP</dt>
                  <dd className="font-mono text-xs">{event.ipAddress}</dd>
                </div>
              )}
              {event.userAgent && (
                <div className="flex justify-between">
                  <dt className="text-muted">User agent</dt>
                  <dd className="max-w-[220px] truncate font-medium">{event.userAgent}</dd>
                </div>
              )}
            </dl>
            {event.meta && (
              <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-muted p-3 font-mono text-xs text-foreground">
                {JSON.stringify(event.meta, null, 2)}
              </pre>
            )}
          </div>

          {event.resolved ? (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Resolution</p>
              <p className="mt-3 text-muted">{event.resolution ?? "Resolved without a note."}</p>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted">Resolved at</dt>
                  <dd className="font-medium">
                    {event.resolvedAt ? formatDateTime(event.resolvedAt) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Resolved by</dt>
                  <dd className="font-medium">{event.resolvedBy?.email ?? "—"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <RiskResolveForm riskEventId={event.id} />
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <UserIcon size={14} /> Member
            </p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Email</dt>
                <dd className="font-medium">
                  <Link href={`/admin/users/${event.user.id}`} className="text-primary hover:underline">
                    {event.user.email}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{event.user.status.replace("_", " ")}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}