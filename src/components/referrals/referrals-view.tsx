"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CountCard } from "@/components/dashboard/count-card";
import { MoneyCard } from "@/components/dashboard/money-card";
import { CopyIcon, UsersIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";
import { formatRelativeTime } from "@/lib/utils";

type Invite = {
  id: string;
  email: string;
  status: string;
  amount: number | null;
  rewardedAt: Date | null;
  createdAt: Date;
};

const statusTone: Record<string, "neutral" | "warning" | "success" | "danger" | "info"> = {
  PENDING: "warning",
  ELIGIBLE: "info",
  COMPLETED: "success",
  REJECTED: "danger",
};

export function ReferralsView({
  referralCode,
  referralLink,
  totalInvites,
  completedInvites,
  pendingInvites,
  totalRewarded,
  invites,
}: {
  referralCode: string | null;
  referralLink: string | null;
  totalInvites: number;
  completedInvites: number;
  pendingInvites: number;
  totalRewarded: number;
  invites: Invite[];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Referrals</h1>
        <p className="mt-1 text-sm text-muted">
          Invite friends. When they earn their first reward, you earn a referral bonus too.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CountCard label="Total invites" value={totalInvites} hint="sent" />
        <CountCard label="Completed" value={completedInvites} hint="activated" />
        <CountCard label="Pending" value={pendingInvites} hint="in progress" />
        <MoneyCard label="Referral earnings" amount={totalRewarded} tone="success" hint="From referrals" />
      </div>

      {referralCode && referralLink ? (
        <Card className="border-primary-soft bg-primary-faint">
          <CardBody className="space-y-4">
            <div>
              <p className="font-semibold text-primary-strong">Your referral link</p>
              <p className="mt-0.5 text-sm text-muted">
                Share it and earn a bonus when each invite reaches their first reward.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="flex-1 truncate rounded-[var(--radius-sm)] border border-border-strong bg-white px-3.5 py-2.5 text-sm text-foreground">
                {referralLink}
              </code>
              <Button onClick={copy}>
                <CopyIcon size={16} />
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </div>
            <p className="text-xs text-muted">
              Your code: <strong className="uppercase text-foreground">{referralCode}</strong>
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="py-10 text-center text-sm text-muted">
            Your referral code will appear here after you verify your email.
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your invites"
          subtitle={invites.length > 0 ? "Newest first" : undefined}
        />
        <CardBody>
          {invites.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              <UsersIcon className="mx-auto mb-2 text-muted-soft" />
              No invites yet. Share your link to start earning referral bonuses.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{i.email}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatRelativeTime(i.createdAt)}
                      {i.rewardedAt ? ` · rewarded ${formatRelativeTime(i.rewardedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.status === "COMPLETED" && i.amount != null && (
                      <span className="text-sm font-semibold text-success">
                        +{formatMoney(i.amount)}
                      </span>
                    )}
                    <Badge tone={statusTone[i.status] ?? "neutral"}>{i.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}