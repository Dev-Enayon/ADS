import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { getAdvertiserAnalytics, getDashboardCharts } from "@/services/analytics";
import { PageHeader, Panel } from "@/components/advertiser/cards";
import { AnalyticsCharts, type ChartCampaign } from "@/components/advertiser/analytics-charts";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const [analytics, charts] = await Promise.all([
    getAdvertiserAnalytics(ctx.advertiser.id),
    getDashboardCharts(ctx.advertiser.id),
  ]);
  const t = analytics.totals as unknown as {
    campaigns: number;
    plannedBudget: number;
    allocated: number;
    spent: number;
    remaining: number;
    completions: number;
    viewsStarted: number;
    viewsCompleted: number;
    rewardValueGranted: number;
  };

  const completionRate = t.viewsStarted > 0 ? Math.round((t.viewsCompleted / t.viewsStarted) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How your campaigns are performing as members watch and earn."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Campaigns" value={String(t.campaigns)} sub={`Budget ${formatMoney(t.plannedBudget)}`} />
        <Panel title="Views started" value={t.viewsStarted.toLocaleString()} sub={`${t.viewsCompleted.toLocaleString()} completed`} />
        <Panel title="Completions" value={t.completions.toLocaleString()} sub={`${completionRate}% completion rate`} tone="success" />
        <Panel title="Rewards granted" value={formatMoney(t.rewardValueGranted)} sub={`Spent ${formatMoney(t.spent)} of ${formatMoney(t.allocated)}`} />
      </div>

      <div className="mt-6">
        <AnalyticsCharts campaigns={charts.campaigns as unknown as ChartCampaign[]} />
      </div>
    </>
  );
}