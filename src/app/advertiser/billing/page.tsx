import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { getBillingSummary } from "@/services/funding";
import { PageHeader, Panel, EmptyState } from "@/components/advertiser/cards";
import { FundingForm } from "@/components/advertiser/funding-form";
import { FundingStatusBadge } from "@/components/advertiser/status";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const billing = await getBillingSummary(ctx.advertiser.id);
  const { wallet, campaigns, recentFunding } = billing;

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Funding your wallet lets you allocate budget to campaigns."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Wallet balance" value={formatMoney(wallet.availableBalance)} sub={`Total funded ${formatMoney(wallet.totalFunded)}`} />
        <Panel title="Allocated" value={formatMoney(wallet.totalAllocated)} sub={`Spent ${formatMoney(wallet.totalSpent)}`} />
        <Panel title="Campaign budget" value={formatMoney(campaigns.totalPlannedBudget)} sub={`${campaigns.count} campaign(s)`} />
        <Panel title="Reserved remaining" value={formatMoney(campaigns.totalRemaining)} sub={`Unspent across campaigns`} />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Fund your wallet</h2>
        <FundingForm />
        <p className="mt-3 text-xs text-muted">
          In this development environment payments are simulated and credited instantly. In
          production, funds flow through an approved payment provider before being credited.
        </p>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-foreground">Funding history</h2>
      {recentFunding.length === 0 ? (
        <EmptyState title="No funding yet" description="Fund your wallet to start campaigns." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentFunding.map((f) => (
                <tr key={f.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{f.reference}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatMoney(f.amount)}</td>
                  <td className="px-4 py-3">
                    <FundingStatusBadge status={f.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(f.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}