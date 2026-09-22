import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { listCreativesForAdvertiser } from "@/services/creatives";
import { PageHeader, EmptyState } from "@/components/advertiser/cards";
import { Button } from "@/components/ui/button";
import { ClapperIcon, PlusIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function CreativesPage() {
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const list = await listCreativesForAdvertiser(ctx.advertiser.id, { page: 1, pageSize: 50 });

  return (
    <>
      <PageHeader
        title="Creatives"
        subtitle="Video assets attached to your campaigns."
        actions={
          <Link href="/advertiser/campaigns">
            <Button size="sm">
              <PlusIcon size={16} />
              Attach to a campaign
            </Button>
          </Link>
        }
      />

      {list.rows.length === 0 ? (
        <EmptyState
          title="No creatives yet"
          description="Creatives are created inside a campaign wizard. Create a campaign and add its video."
          action={
            <Link href="/advertiser/campaigns/new">
              <Button size="sm">Create campaign</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.rows.map((c) => {
            const verified = Boolean(
              (c.meta as { durationVerified?: boolean } | null)?.durationVerified,
            );
            return (
              <Link
                key={c.id}
                href={`/advertiser/campaigns/${c.campaign.id}`}
                className="group overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong"
              >
                <div className="flex aspect-video items-center justify-center bg-surface-strong">
                  <ClapperIcon size={32} />
                </div>
                <div className="p-4">
                  <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
                  <p className="mt-1 truncate text-xs text-muted">{c.campaign.name}</p>
                  <p className="mt-2 text-xs text-muted">
                    {c.durationSeconds}s · {c.status} · {verified ? "automatically verified" : "client-declared duration"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}