import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { listCampaigns } from "@/services/campaigns";
import { PageHeader, EmptyState, ProgressBar } from "@/components/advertiser/cards";
import { CampaignFilters } from "@/components/advertiser/campaign-filters";
import { CampaignStatusBadge } from "@/components/advertiser/status";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; pageSize?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const list = await listCampaigns(ctx.advertiser.id, {
    status: sp.status ?? "ALL",
    q: sp.q,
    page: Number(sp.page ?? 1),
    pageSize: Number(sp.pageSize ?? 10),
    sort: (sp.sort ?? "newest") as "newest" | "oldest" | "budget" | "spend",
  });

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Create, review, and track your sponsored campaigns."
        actions={
          <Link href="/advertiser/campaigns/new">
            <Button size="sm">
              <PlusIcon size={16} />
              New campaign
            </Button>
          </Link>
        }
      />

      <CampaignFilters />

      {list.rows.length === 0 ? (
        <EmptyState
          title="No campaigns found"
          description="Adjust your filters or create a new campaign to get started."
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
        <div className="grid gap-4 sm:grid-cols-2">
          {list.rows.map((c) => {
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {c.currentCompletions.toLocaleString()} / {c.maxCompletions.toLocaleString()}{" "}
                      completions · {formatMoney(c.rewardPerCompletion)} / view
                    </p>
                  </div>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-[11px] text-muted">
                    <span>
                      Budget {formatMoney(c.budget)} · spent {formatMoney(c.spentAmount)}
                    </span>
                  </div>
                  <ProgressBar
                    value={pct}
                    tone={c.status === "ACTIVE" ? "success" : c.status === "PAUSED" ? "warning" : "primary"}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}