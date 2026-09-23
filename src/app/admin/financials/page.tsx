import { PageHeader, Panel } from "@/components/advertiser/cards";
import { getAdminSession } from "@/lib/auth/admin";
import { getFinancialSummary } from "@/services/admin/financials";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import {
  BanknoteIcon,
  BuildingIcon,
  ClockIcon,
  LayersIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function AdminFinancialsPage() {
  await getAdminSession();
  const data = await getFinancialSummary();

  const w = data.walletTotals;
  const a = data.advertiserTotals;
  const c = data.counts;

  return (
    <>
      <PageHeader
        title="Financials"
        subtitle="Aggregated ledgers — single source of truth, no cached counters."
      />

      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-soft">Member wallets</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Available" value={formatMoney(w.availableBalance)} icon={<BanknoteIcon size={20} />} />
        <Panel title="Pending" value={formatMoney(w.pendingBalance)} icon={<ClockIcon size={20} />} />
        <Panel title="Total earned" value={formatMoney(w.totalEarned)} icon={<BanknoteIcon size={20} />} />
        <Panel title="Total withdrawn" value={formatMoney(w.totalWithdrawn)} icon={<BanknoteIcon size={20} />} />
      </div>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-soft">Advertiser escrow</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Available" value={formatMoney(a.availableBalance)} icon={<BuildingIcon size={20} />} />
        <Panel title="Total funded" value={formatMoney(a.totalFunded)} icon={<BuildingIcon size={20} />} />
        <Panel title="Allocated" value={formatMoney(a.totalAllocated)} icon={<LayersIcon size={20} />} />
        <Panel title="Spent" value={formatMoney(a.totalSpent)} icon={<BuildingIcon size={20} />} />
      </div>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-soft">Counts</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Users" value={c.users.toLocaleString()} icon={<UsersIcon size={20} />} href="/admin/users" />
        <Panel title="Advertisers" value={c.advertisers.toLocaleString()} icon={<BuildingIcon size={20} />} href="/admin/advertisers" />
        <Panel title="Campaigns" value={c.campaigns.toLocaleString()} icon={<LayersIcon size={20} />} href="/admin/campaigns" />
        <Panel title="Pending rewards" value={c.pendingRewards.toLocaleString()} />
        <Panel title="Withdrawals" value={c.withdrawals.toLocaleString()} icon={<BanknoteIcon size={20} />} href="/admin/withdrawals" />
        <Panel
          title="In-flight payouts"
          value={c.inFlightWithdrawals.toLocaleString()}
          tone={c.inFlightWithdrawals > 0 ? "accent" : "default"}
        />
        <Panel
          title="Unresolved risk"
          value={c.unresolvedRisk.toLocaleString()}
          icon={<ShieldIcon size={20} />}
          tone={c.unresolvedRisk > 0 ? "danger" : "default"}
          href="/admin/risk"
        />
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-soft">Recent ledger</p>
        {data.recentLedger.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-sm text-muted">
            No ledger activity yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Direction</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLedger.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{l.user.email}</p>
                      <p className="text-xs text-muted">{l.description}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{l.type.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-muted">{l.direction}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatSignedMoney(l.direction === "DEBIT" ? -l.amount : l.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted">{l.status}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(l.createdAt)}</td>
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