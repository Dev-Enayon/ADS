import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { listOpportunities } from "@/services/opportunities";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Earn rewards" };

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const opportunities = await listOpportunities(user.id);
  const eligible = opportunities.filter((o) => o.eligible);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Earn rewards</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a sponsored opportunity, complete the watch time, and earn a verified reward.
        </p>
      </div>

      {!user.emailVerifiedAt && (
        <Alert tone="warning">
          Verify your email to start earning. Rewards are only granted to verified accounts.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Available opportunities"
          subtitle={`${eligible.length} open${eligible.length === 1 ? "" : "s"} right now`}
        />
        <CardBody className="space-y-3">
          {eligible.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              No sponsored opportunities are live at the moment. New batches are added regularly —
              check back soon.
            </div>
          ) : (
            eligible.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} />)
          )}
        </CardBody>
      </Card>

      {opportunities.length > eligible.length && (
        <div>
          <p className="pb-3 text-sm font-semibold text-muted">Unavailable</p>
          <div className="space-y-3 opacity-70">
            {opportunities
              .filter((o) => !o.eligible)
              .map((opp) => (
                <OpportunityCard key={opp.id} opportunity={opp} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}