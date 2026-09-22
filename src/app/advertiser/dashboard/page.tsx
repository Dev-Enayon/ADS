import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { getDashboardData } from "@/services/campaigns";
import { PageHeader, Panel, ProgressBar, EmptyState } from "@/components/advertiser/cards";
import { CampaignStatusBadge } from "@/components/advertiser/status";
import { Button } from "@/components/ui/button";
import {
  ChartIcon,
  LayersIcon,
  MegaphoneIcon,
  PauseIcon,
  PlusIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdvertiserDashboardPage() {
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const data = await getDashboardData(ctx.advertiser.id);
  const { totals, wallet } = data;

  const spendPercent =
    totals.allocated > 0 ? Math.round((totals.spent / totals.allocated) * 100) : 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${ctx.advertiser.businessName}`}
        subtitle="Manage your campaigns, budget, and audience."
        actions={
          <Link href="/advertiser/campaigns/new">
            <Button size="sm">
              <PlusIcon size={16} />
              New campaign
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel
          title="Balance"
          value={formatMoney(wallet.availableBalance)}
          sub={`Funded ${formatMoney(wallet.totalFunded)}`}
          icon={<WalletIcon size={22} />}
          href="/advertiser/billing"
        />
        <Panel
          title="Live campaigns"
          value={String(data.activeCount)}
          sub={`${data.campaignCount} total`}
          icon={<MegaphoneIcon size={22} />}
          href="/advertiser/campaigns"
        />
        <Panel
          title="Completions"
          value={totals.completions.toLocaleString()}
          sub={`Spent ${formatMoney(totals.spent)}`}
          icon={<ChartIcon size={22} />}
          tone="accent"
          href="/advertiser/analytics"
        />
        <Panel
          title="Unspent budget"
          value={formatMoney(totals.remaining)}
          sub={totals.lowBudget > 0 ? `${totals.lowBudget} campaign(s) low` : "Allocated budget"}
          icon={<PauseIcon size={22} />}
          tone={totals.lowBudget > 0 ? "danger" : "default"}
          href="/advertiser/billing"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LayersIcon size={16} />
              Recent campaigns
            </h2>
            <Link href="/advertiser/campaigns" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>

          {data.recent.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="Create your first campaign to start reaching members who watch sponsorships to earn."
              action={
                <Link href="/advertiser/campaigns/new">
                  <Button size="sm">
                    <PlusIcon size={16} />
                    Create campaign
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {data.recent.map((c) => {
                const pct =
                  c.status === "ACTIVE" && c.budget > 0
                    ? Math.round((c.spentAmount / c.budget) * 100)
                    : 0;
                return (
                  <Link
                    key={c.id}
                    href={`/advertiser/campaigns/${c.id}`}
                    className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {c.currentCompletions.toLocaleString()} completions · spent{" "}
                          {formatMoney(c.spentAmount)}
                        </p>
                      </div>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <div className="mt-3">
                      <ProgressBar
                        value={pct}
                        tone={c.status === "ACTIVE" ? "success" : "primary"}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Budget usage</h2>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Spent</span>
              <span className="font-semibold text-foreground">
                {formatMoney(totals.spent)} of {formatMoney(totals.allocated)}
              </span>
            </div>
            <ProgressBar value={spendPercent} tone="success" />
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Allocated</dt>
                <dd className="font-medium text-foreground">{formatMoney(totals.allocated)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Planned budget</dt>
                <dd className="font-medium text-foreground">{formatMoney(totals.planned)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Remaining</dt>
                <dd className="font-medium text-foreground">{formatMoney(totals.remaining)}</dd>
              </div>
            </dl>
          </div>
          <Link href="/advertiser/billing">
            <Button variant="outline" size="sm" className="w-full">
              Fund wallet
            </Button>
          </Link>
        </section>
      </div>
    </>
  );
}