import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/stats";
import { listTransactions } from "@/services/wallet";
import { listOpportunities } from "@/services/opportunities";
import { greeting } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { MoneyCard } from "@/components/dashboard/money-card";
import { TransactionList } from "@/components/dashboard/transaction-list";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PlayIcon, SparklesIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const [stats, recentTransactions, opportunities] = await Promise.all([
    getDashboardStats(user.id),
    listTransactions(user.id, { limit: 8 }),
    listOpportunities(user.id),
  ]);

  const firstName = user.profile?.fullName?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-lg font-semibold text-foreground sm:text-xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </p>
        <p className="text-sm text-muted">Here&apos;s your earning activity today.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyCard
          label="Available Balance"
          amount={stats.availableBalance}
          tone="success"
          hint="Ready to withdraw"
        />
        <MoneyCard
          label="Pending Rewards"
          amount={stats.pendingBalance}
          hint="Passing validation"
        />
        <MoneyCard
          label="Today's Earnings"
          amount={stats.todayEarnings}
          hint="Credits earned today"
        />
        <MoneyCard
          label="Total Earnings"
          amount={stats.totalEarned}
          tone="info"
          hint={`${formatMoney(stats.totalWithdrawn)} withdrawn`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader
            title="Available Opportunities"
            subtitle={
              stats.availableOpportunities
                ? `${stats.availableOpportunities} sponsored video${stats.availableOpportunities > 1 ? "s" : ""} ready for you`
                : "New opportunities are added regularly"
            }
            action={
              <Link href="/opportunities">
                <Button variant="outline" size="sm">
                  View all
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {opportunities.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
                <SparklesIcon className="mx-auto mb-2 text-muted-soft" />
                No sponsored opportunities are live right now. Check back soon.
              </div>
            ) : (
              opportunities.slice(0, 4).map((opp) => (
                <OpportunityCard key={opp.id} opportunity={opp} />
              ))
            )}
          </CardBody>
        </Card>

        <Card className="md:col-span-2">
          <Card
            className="mb-4 border-primary-soft bg-gradient-to-br from-primary-faint to-surface"
          >
            <CardBody>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-strong">
                    <PlayIcon size={16} />
                    Watch & Earn
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Complete a sponsored video to earn a verified reward.
                  </p>
                </div>
                <Link href="/opportunities">
                  <Button size="sm">Start now</Button>
                </Link>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Recent Activity"
              action={
                <Link href="/wallet" className="text-sm font-medium text-primary hover:underline">
                  Wallet
                </Link>
              }
            />
            <CardBody>
              <TransactionList
                transactions={recentTransactions.map((t) => ({
                  id: t.id,
                  type: t.type,
                  direction: t.direction,
                  amount: t.amount,
                  description: t.description,
                  reference: t.reference,
                  createdAt: t.createdAt.toISOString(),
                  status: t.status,
                }))}
              />
            </CardBody>
          </Card>
        </Card>
      </div>
    </div>
  );
}