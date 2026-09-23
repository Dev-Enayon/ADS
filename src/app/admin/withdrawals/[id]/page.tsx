import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminSession } from "@/lib/auth/admin";
import { getWithdrawalDetail } from "@/services/admin/withdrawals";
import { PageHeader } from "@/components/advertiser/cards";
import { WithdrawalStatusBadge } from "@/components/admin/badges";
import { AdminActionButton } from "@/components/admin/actions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { BanknoteIcon, ChevronLeftIcon, UserIcon } from "@/components/ui/icons";
import {
  FailWithdrawalForm,
  ReverseWithdrawalForm,
  SettleWithdrawalForm,
} from "./withdrawal-actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminWithdrawalDetailPage({ params }: Props) {
  await getAdminSession();
  const { id } = await params;

  let withdrawal;
  try {
    withdrawal = await getWithdrawalDetail(id);
  } catch {
    notFound();
  }

  const canPay = withdrawal.status === "PENDING" || withdrawal.status === "PROCESSING";
  const url = `/api/admin/withdrawals/${withdrawal.id}`;

  return (
    <>
      <Link
        href="/admin/withdrawals"
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
      >
        <ChevronLeftIcon size={14} /> Withdrawals
      </Link>
      <PageHeader
        title={formatMoney(withdrawal.amount)}
        subtitle={withdrawal.reference}
        actions={<WithdrawalStatusBadge status={withdrawal.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <BanknoteIcon size={14} /> Payout
            </p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-muted">Amount</dt>
                <dd className="font-medium text-foreground">{formatMoney(withdrawal.amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Fee</dt>
                <dd className="font-medium">{formatMoney(withdrawal.fee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Net payout</dt>
                <dd className="font-medium text-foreground">{formatMoney(withdrawal.netAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Method</dt>
                <dd className="font-medium">{withdrawal.paymentMethod.replace("_", " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Provider</dt>
                <dd className="font-medium">{withdrawal.provider}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Provider ref</dt>
                <dd className="font-mono text-xs">{withdrawal.providerRef ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Provider status</dt>
                <dd className="font-medium">{withdrawal.providerStatus ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Attempts</dt>
                <dd className="font-medium">{withdrawal.payoutAttempts}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Processed at</dt>
                <dd className="font-medium">{withdrawal.processedAt ? formatDateTime(withdrawal.processedAt) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Processed by</dt>
                <dd className="font-medium">{withdrawal.processedBy?.email ?? "—"}</dd>
              </div>
            </dl>
            {withdrawal.failureReason && (
              <p className="mt-3 rounded-xl bg-danger-soft/60 p-3 text-xs text-danger">{withdrawal.failureReason}</p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <UserIcon size={14} /> Member
            </p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Email</dt>
                <dd className="font-medium">
                  <Link href={`/admin/users/${withdrawal.userId}`} className="text-primary hover:underline">
                    {withdrawal.user.email}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Name</dt>
                <dd className="font-medium">{withdrawal.user.profile?.fullName ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Wallet available</dt>
                <dd className="font-medium">{formatMoney(withdrawal.user.wallet?.availableBalance ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Wallet pending</dt>
                <dd className="font-medium">{formatMoney(withdrawal.user.wallet?.pendingBalance ?? 0)}</dd>
              </div>
            </dl>
          </div>

          {withdrawal.paymentDetails && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Payment details</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-muted p-3 font-mono text-xs text-foreground">
                {JSON.stringify(withdrawal.paymentDetails, null, 2)}
              </pre>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Ledger</p>
            {withdrawal.ledgerEntries.length === 0 ? (
              <p className="mt-3 text-muted">No ledger entries.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {withdrawal.ledgerEntries.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{l.description}</p>
                      <p className="text-xs text-muted">
                        {l.type} · {l.status} · {l.reference}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {l.direction === "DEBIT" ? "−" : "+"}
                      {formatMoney(l.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Actions</p>
            <div className="mt-3 space-y-3">
              {withdrawal.status === "PENDING" && (
                <AdminActionButton
                  url={url}
                  payload={{ action: "dispatch" }}
                  label="Dispatch to provider"
                  variant="primary"
                  confirm="Dispatch this withdrawal to the payout provider now?"
                  successMessage="Withdrawal dispatched"
                />
              )}
              {canPay && (
                <>
                  <SettleWithdrawalForm url={url} defaultRef={withdrawal.providerRef} />
                  <FailWithdrawalForm url={url} />
                </>
              )}
              {withdrawal.status === "SUCCESS" && <ReverseWithdrawalForm url={url} />}
            </div>
            {withdrawal.status === "PENDING" && (
              <p className="mt-3 text-xs text-muted">
                Dispatch queues it with the provider; settle is for manual bank transfers.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}