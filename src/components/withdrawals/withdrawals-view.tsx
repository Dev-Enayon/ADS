"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { apiErrorMessage, apiFetch } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

type Withdrawal = {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: string;
  reference: string;
  paymentMethod: string;
  failureReason: string | null;
  createdAt: string;
};

type Rules = { minimum: number; maximum: number; dailyLimit: number; feeRate: number };

type Method = "BANK_TRANSFER" | "USSD" | "MOBILE_MONEY" | "OTHER";

const statusTone: Record<string, "neutral" | "warning" | "success" | "danger" | "info"> = {
  PENDING: "warning",
  PROCESSING: "info",
  SUCCESS: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function WithdrawalsView({
  user,
  wallet,
  withdrawals,
  rules,
}: {
  user: { emailVerified: boolean; status: string };
  wallet: { availableBalance: number; pendingBalance: number };
  withdrawals: Withdrawal[];
  rules: Rules;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("BANK_TRANSFER");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kobo = Math.round((Number(amount) || 0) * 100);
  const fee = Math.floor((kobo * rules.feeRate) / 100);

  const canWithdraw =
    user.emailVerified && user.status === "ACTIVE" && wallet.availableBalance >= rules.minimum;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/withdrawals", {
        body: {
          amount: Number(amount),
          paymentMethod: method,
          paymentDetails: {
            ...(method === "BANK_TRANSFER"
              ? { accountName, accountNumber, bankName }
              : {}),
            ...(method === "MOBILE_MONEY" || method === "USSD" ? { phoneNumber } : {}),
            ...(method === "OTHER" ? { accountName } : {}),
          },
          idempotencyKey:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `wd-${Date.now()}`,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this withdrawal? The full amount will be returned to your wallet.")) return;
    try {
      await apiFetch(`/api/withdrawals/${id}/cancel`, { method: "POST" });
      router.refresh();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Withdrawals</h1>
          <p className="mt-1 text-sm text-muted">
            Request a payout from your verified, available balance.
          </p>
        </div>
        <div className="text-sm text-muted">
          Available:{" "}
          <span className="font-bold text-success">{formatMoney(wallet.availableBalance)}</span>
        </div>
      </div>

      {!user.emailVerified ? (
        <Alert tone="warning">
          Verify your email address to unlock withdrawals. Check your inbox for the verification link.
        </Alert>
      ) : (
        <Card className="border-primary-soft bg-primary-faint">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-primary-strong">Request a withdrawal</p>
              <p className="mt-0.5 text-sm text-muted">
                Minimum {formatMoney(rules.minimum)}
                {rules.maximum > 0 ? ` · Max ${formatMoney(rules.maximum)} per request` : ""}
                {rules.dailyLimit > 0 ? ` · Daily limit ${formatMoney(rules.dailyLimit)}` : ""}
                {rules.feeRate > 0 ? ` · ${rules.feeRate}% processing fee` : " · No processing fee"}
              </p>
            </div>
            <Button onClick={() => setOpen(true)} disabled={!canWithdraw} size="lg">
              Withdraw
            </Button>
          </CardBody>
        </Card>
      )}

      {wallet.pendingBalance > 0 && (
        <p className="text-xs text-muted">
          {formatMoney(wallet.pendingBalance)} is pending validation and not yet withdrawable.
        </p>
      )}

      <Card>
        <CardHeader
          title="Withdrawal history"
          subtitle={withdrawals.length > 0 ? "Recent requests" : undefined}
        />
        <CardBody>
          {withdrawals.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
              No withdrawals yet. When you&apos;re ready, request your first payout above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {formatMoney(w.amount)}
                      {w.fee > 0 && (
                        <span className="text-xs font-normal text-muted">fee {formatMoney(w.fee)}</span>
                      )}
                      <Badge tone={statusTone[w.status] ?? "neutral"}>{w.status}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(new Date(w.createdAt))} · {w.reference} · {w.paymentMethod}
                    </p>
                    {w.failureReason && (
                      <p className="mt-0.5 text-xs text-danger">{w.failureReason}</p>
                    )}
                  </div>
                  {w.status === "PENDING" && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(w.id)}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => (busy ? undefined : setOpen(false))} title="Request withdrawal">
        <div className="space-y-4">
          <div className="rounded-[var(--radius-sm)] bg-surface-muted px-4 py-3 text-sm text-muted">
            Balance: <strong className="text-foreground">{formatMoney(wallet.availableBalance)}</strong>
            {" · "}Minimum: <strong className="text-foreground">{formatMoney(rules.minimum)}</strong>
          </div>
          {error && (
            <div className="rounded-[var(--radius-sm)] border border-danger-soft bg-danger-soft/60 px-3 py-2.5 text-sm font-medium text-danger">
              {error}
            </div>
          )}
          <Field
            label="Amount (₦)"
            htmlFor="wd-amount"
            hint={
              kobo > 0
                ? `You will receive ${formatMoney(kobo - fee)}${fee > 0 ? ` after a ${rules.feeRate}% fee` : ""}.`
                : undefined
            }
          >
            <Input
              id="wd-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </Field>
          <Field label="Payout method" htmlFor="wd-method">
            <Select
              id="wd-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
            >
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="USSD">USSD</option>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>

          {(method === "BANK_TRANSFER" || method === "OTHER") && (
            <Field label={method === "BANK_TRANSFER" ? "Account name" : "Details"} htmlFor="wd-name">
              <Input
                id="wd-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={method === "BANK_TRANSFER" ? "e.g. Ada Nwosu" : "Recipient or details"}
              />
            </Field>
          )}
          {method === "BANK_TRANSFER" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Account number" htmlFor="wd-acct">
                <Input
                  id="wd-acct"
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="0000000000"
                />
              </Field>
              <Field label="Bank" htmlFor="wd-bank">
                <Input
                  id="wd-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Bank XYZ"
                />
              </Field>
            </div>
          )}
          {(method === "MOBILE_MONEY" || method === "USSD") && (
            <Field label="Phone number" htmlFor="wd-phone">
              <Input
                id="wd-phone"
                inputMode="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 08012345678"
              />
            </Field>
          )}

          <Button
            className="w-full"
            size="lg"
            loading={busy}
            disabled={!(Number(amount) > 0) || kobo < rules.minimum}
            onClick={submit}
          >
            Request {kobo > 0 ? formatMoney(kobo) : "withdrawal"}
          </Button>
          {kobo > 0 && kobo < rules.minimum && (
            <p className="text-center text-xs text-danger">
              Minimum withdrawal is {formatMoney(rules.minimum)}.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}