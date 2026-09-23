import { PageHeader, Panel } from "@/components/advertiser/cards";
import { getAdminSession } from "@/lib/auth/admin";
import { getSystemHealth, getWebhookFailures } from "@/services/admin/system";
import { formatDateTime } from "@/lib/utils";
import {
  BanknoteIcon,
  BuildingIcon,
  InfoIcon,
  LayersIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  await getAdminSession();
  const [health, failures] = await Promise.all([getSystemHealth(), getWebhookFailures()]);

  const ok = health.status === "ok";

  return (
    <>
      <PageHeader
        title="System"
        subtitle={`Health probe: ${formatDateTime(new Date(health.runtime.timestamp))}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel
          title="Status"
          value={ok ? "OK" : "Degraded"}
          tone={ok ? "success" : "danger"}
          icon={<InfoIcon size={20} />}
        />
        <Panel title="Environment" value={health.runtime.environment} />
        <Panel title="Payment provider" value={health.runtime.paymentProvider} />
        <Panel title="Payout provider" value={health.runtime.payoutProvider} />
        <Panel title="Users" value={health.counts.users.toLocaleString()} icon={<UsersIcon size={20} />} />
        <Panel title="Advertisers" value={health.counts.advertisers.toLocaleString()} icon={<BuildingIcon size={20} />} />
        <Panel title="Campaigns" value={health.counts.campaigns.toLocaleString()} icon={<LayersIcon size={20} />} />
        <Panel
          title="Pending payouts"
          value={health.counts.pendingPayouts.toLocaleString()}
          icon={<BanknoteIcon size={20} />}
          tone={health.counts.pendingPayouts > 0 ? "accent" : "default"}
        />
        <Panel
          title="Failed webhooks"
          value={health.counts.failedWebhooks.toLocaleString()}
          icon={<InfoIcon size={20} />}
          tone={health.counts.failedWebhooks > 0 ? "danger" : "default"}
        />
        <Panel
          title="Unresolved risk"
          value={health.counts.unresolvedRisk.toLocaleString()}
          icon={<ShieldIcon size={20} />}
          tone={health.counts.unresolvedRisk > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Runtime</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex justify-between">
            <dt className="text-muted">Database</dt>
            <dd className="font-medium">{health.db ? "Connected" : "Unreachable"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">App URL</dt>
            <dd className="max-w-[260px] truncate font-mono text-xs">{health.runtime.appUrl}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Environment</dt>
            <dd className="font-medium">{health.runtime.environment}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Timestamp</dt>
            <dd className="font-medium">{formatDateTime(new Date(health.runtime.timestamp))}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-soft">Failed webhooks</p>
        {failures.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-sm text-muted">
            No failed webhook events.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
                  <th className="px-4 py-3 font-semibold">Provider</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Error</th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{f.provider}</td>
                    <td className="px-4 py-3 text-muted">{f.type}</td>
                    <td className="px-4 py-3 text-muted">
                      {f.entityType ? `${f.entityType} · ${f.entityId ?? ""}` : f.externalRef ?? "—"}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs text-danger">{f.error ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(f.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}