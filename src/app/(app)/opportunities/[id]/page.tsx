import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { listOpportunities } from "@/services/opportunities";
import { VideoWatch } from "@/components/watch/video-watch";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClockIcon, UsersIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Watch & earn" };

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const all = await listOpportunities(user.id);
  const opp = all.find((o) => o.id === id);

  if (!opp) {
    return (
      <div className="space-y-4">
        <Card>
          <CardBody className="py-16 text-center">
            <p className="font-semibold text-foreground">Opportunity not found</p>
            <p className="mt-1 text-sm text-muted">It may have been removed or never existed.</p>
            <Link href="/opportunities" className="mt-5 inline-block">
              <Button variant="outline">Back to opportunities</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Only keep it open for watching when the account can earn or there is a session to resume.
  const canResume = opp.openSession != null;
  if (!opp.eligible && !canResume) {
    return (
      <div className="space-y-4">
        <Card>
          <CardBody className="py-16 text-center">
            <p className="font-semibold text-foreground">Not currently available</p>
            <p className="mt-1 text-sm text-muted">
              This opportunity is unavailable right now — it may have reached its completion
              limit or its window has ended.
            </p>
            <Link href="/opportunities" className="mt-5 inline-block">
              <Button variant="outline">Browse other opportunities</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const initialSession = opp.openSession;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {opp.title}
            </h1>
            {opp.isFeatured && <Badge tone="primary">Featured</Badge>}
            <Badge tone="neutral">{opp.type}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">{opp.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <ClockIcon size={15} />
              {opp.durationSeconds}s of watch time
            </span>
            {opp.maxCompletions != null && (
              <span className="flex items-center gap-1.5">
                <UsersIcon size={15} />
                {opp.maxCompletions - opp.currentCompletions} of {opp.maxCompletions} slots left
              </span>
            )}
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-primary-soft bg-primary-faint px-4 py-3 text-center">
          <p className="text-xs font-medium text-muted">Reward</p>
          <p className="text-xl font-extrabold tracking-tight text-primary-strong">
            {formatMoney(opp.rewardAmount)}
          </p>
        </div>
      </div>

      <Card>
        <CardBody className="p-0 sm:p-0">
          <VideoWatch
            opportunity={{
              id: opp.id,
              title: opp.title,
              videoUrl: opp.videoUrl,
              thumbnailUrl: opp.thumbnailUrl,
              durationSeconds: opp.durationSeconds,
              rewardAmount: opp.rewardAmount,
            }}
            initialSession={
              initialSession
                ? {
                    id: initialSession.id,
                    startedAt: initialSession.startedAt.toISOString(),
                    watchedDuration: initialSession.watchedDuration,
                    requiredDuration: initialSession.requiredDuration,
                  }
                : null
            }
          />
        </CardBody>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-muted">
        Watch time is measured on our servers from the moment you start. Complete the full
        duration and the reward is granted immediately, with no fake balances — every credit
        appears in your wallet ledger.
      </p>
    </div>
  );
}