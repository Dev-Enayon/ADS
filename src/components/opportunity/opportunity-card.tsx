import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClockIcon, PlayIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";
import type { PublicOpportunity } from "@/services/opportunities";

export function OpportunityCard({ opportunity }: { opportunity: PublicOpportunity }) {
  const hasOpenSession = opportunity.openSession != null;
  return (
    <div className="flex items-center gap-4 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-muted sm:block">
        {opportunity.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={opportunity.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-soft">
            <PlayIcon size={28} />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/10 text-white">
          <PlayIcon size={22} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{opportunity.title}</p>
          {opportunity.isFeatured && <Badge tone="primary">Featured</Badge>}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-muted">{opportunity.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <ClockIcon size={13} />
            {opportunity.durationSeconds}s video
          </span>
          <span className="font-semibold text-primary-strong">
            Earn {formatMoney(opportunity.rewardAmount)}
          </span>
        </div>
      </div>
      <Link href={`/opportunities/${opportunity.id}`} className="shrink-0">
        <Button size="sm" variant={hasOpenSession ? "outline" : "primary"}>
          {hasOpenSession ? "Resume" : "Watch"}
        </Button>
      </Link>
    </div>
  );
}