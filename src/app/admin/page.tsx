import Link from "next/link";

import { getAdminSession } from "@/lib/auth/admin";
import { getFinancialSummary } from "@/services/admin/financials";
import { getSystemHealth } from "@/services/admin/system";
import {
  BanknoteIcon,
  BuildingIcon,
  ClockIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/advertiser/cards";
import { Button } from "@/components/ui/button";
import { UserRoleBadge, RiskSeverityBadge, WithdrawalStatusBadge } from "@/components/admin/badges";
import { AdminActionButton } from "@/components/admin/actions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) return null;

  const [financials, health, recentWithdrawals, openRisk] = await Promise.all([
    getFinancialSummary(),
    getSystemHealth(),
    prisma.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { email: true, profile: { select: { fullName: true } } } },
      },
    }),
    prisma.riskEvent.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { email: true } } },
    }),
  ]);

  const c = financials.counts;

  return (
    <>
      <PageHeader
        title={`Admin console`}
        subtitle="Operations overview for RewardHub."
        actions={<UserRoleBadge role={session.user.role} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel
          title="Users"
          value={c.users.toLocaleString()}
          sub={`${financials.walletTotals.availableBalance === 0 ? "wallets" : `available ${formatMoney(financials.walletTotals.availableBalance)}`}`}
          icon={<UsersIcon size={22} />}
          href="/admin/users"
        />
        <Panel
          title="Advertisers"
          value={c.advertisers.toLocaleString()}
          sub={`${c.campaigns.toLocaleString()} campaigns`}
          icon={<BuildingIcon size={22} />}
          href="/admin/advertisers"
        />
        <Panel
          title="Pending payouts"
          value={c.inFlightWithdrawals.toLocaleString()}
          sub={`${c.withdrawals.toLocaleString()} total withdrawals`}
          icon={<BanknoteIcon size={22} />}
          tone={c.inFlightWithdrawals > 0 ? "accent" : "default"}
          href="/admin/withdrawals"
        />
        <Panel
          title="Open risk events"
          value={c.unresolvedRisk.toLocaleString()}
          sub={`pending rewards ${c.pendingRewards.toLocaleString()}`}
          icon={<ShieldIcon size={22} />}
          tone={c.unresolvedRisk > 0 ? "danger" : "default"}
          href="/admin/risk"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ClockIcon size={16} />
              Recent withdrawals
            </h2>
            <Link href="/admin/withdrawals" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>

          {recentWithdrawals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-sm text-muted">
              No withdrawals yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWithdrawals.map((w) => (
                    <tr key={w.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/admin/withdrawals/${w.id}`} className="font-medium text-foreground hover:underline">
                          {w.user.profile?.fullName ?? w.user.email}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatMoney(w.amount)}</td>
                      <td className="px-4 py-3">
                        <WithdrawalStatusBadge status={w.status} />
                      </td>
                      <td className="px-4 py-3 text-muted">{formatDateTime(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldIcon size={16} />
                Open risk events
              </h2>
              <Link href="/admin/risk" className="text-xs font-medium text-primary hover:underline">
                View all
              </Link>
            </div>

            {openRisk.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-6 text-center text-sm text-muted">
                No open risk events.
              </div>
            ) : (
              <div className="space-y-2">
                {openRisk.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {e.user.email} · {e.type.replaceAll("_", " ")}
                      </p>
                      <p className="truncate text-xs text-muted">{e.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskSeverityBadge severity={e.severity} />
                      <AdminActionButton
                        url={`/api/admin/risk/${e.id}`}
                        payload={{ action: "resolve", resolution: "Resolved from dashboard review." }}
                        label="Resolve"
                        variant="ghost"
                        size="sm"
                        successMessage="Risk event resolved"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Workload</h2>
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <dl className="space-y-2.5">
              <div className="flex justify-between">
                <dt className="text-muted">Users</dt>
                <dd className="font-medium text-foreground">{c.users.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Advertisers</dt>
                <dd className="font-medium text-foreground">{c.advertisers.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Campaigns</dt>
                <dd className="font-medium text-foreground">{c.campaigns.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pending rewards</dt>
                <dd className="font-medium text-foreground">{c.pendingRewards.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total withdrawn</dt>
                <dd className="font-medium text-foreground">
                  {formatMoney(financials.walletTotals.totalWithdrawn)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Advertiser balance</dt>
                <dd className="font-medium text-foreground">
                  {formatMoney(financials.advertiserTotals.availableBalance)}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <Link href="/admin/financials">
                <Button variant="outline" size="sm" className="w-full">
                  Financial summary
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">System</p>
            <dl className="mt-2 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{health.status === "ok" ? "OK" : "Degraded"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Payout provider</dt>
                <dd className="font-mono text-xs font-medium text-foreground">{health.runtime.payoutProvider}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Failed webhooks</dt>
                <dd className="font-medium text-foreground">{health.counts.failedWebhooks}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <Link href="/admin/system">
                <Button variant="outline" size="sm" className="w-full">
                  System details
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}