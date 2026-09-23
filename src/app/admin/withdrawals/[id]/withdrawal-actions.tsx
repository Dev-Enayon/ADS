"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage, apiFetch } from "@/lib/client-api";

function useAdminAction(url: string) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(payload: Record<string, unknown>, successMessage: string) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(url, { method: "PATCH", body: payload });
      pushToast("success", successMessage);
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

/** Settle a withdrawal manually, recording an optional real bank reference. */
export function SettleWithdrawalForm({
  url,
  defaultRef,
}: {
  url: string;
  defaultRef?: string | null;
}) {
  const { busy, error, run } = useAdminAction(url);
  const [providerRef, setProviderRef] = useState(defaultRef ?? "");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Settle manually</p>
          <Field label="Provider reference (bank ref)" htmlFor="wd-settle-ref" hint="Optional — a reference is generated if left blank.">
            <Input
              id="wd-settle-ref"
              value={providerRef}
              onChange={(e) => setProviderRef(e.target.value)}
              placeholder="Optional bank reference"
            />
          </Field>
          {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
        </div>
        <Button
          size="sm"
          loading={busy}
          disabled={busy}
          onClick={() =>
            run(
              { action: "settle", providerRef: providerRef.trim() || undefined },
              "Withdrawal settled",
            )
          }
        >
          Settle
        </Button>
      </div>
    </div>
  );
}

/** Mark a payable withdrawal as failed, returning funds to the user's wallet. */
export function FailWithdrawalForm({ url }: { url: string }) {
  const { busy, error, run } = useAdminAction(url);
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Mark as failed</p>
          <Field label="Reason" htmlFor="wd-fail-reason">
            <Textarea
              id="wd-fail-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this payout failing?"
            />
          </Field>
          <div className="mt-2 flex items-center justify-between gap-3">
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <div className="ml-auto">
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                disabled={busy || !reason.trim()}
                onClick={() => run({ action: "fail", reason: reason.trim() }, "Withdrawal marked failed")}
              >
                Fail payout
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reverse a successful payout, deducting it back from the user's wallet. */
export function ReverseWithdrawalForm({ url }: { url: string }) {
  const { busy, error, run } = useAdminAction(url);
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Reverse payout</p>
          <Field label="Reason" htmlFor="wd-reverse-reason" hint="This returns the amount to the member's wallet.">
            <Textarea
              id="wd-reverse-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this payout being reversed?"
            />
          </Field>
          <div className="mt-2 flex items-center justify-between gap-3">
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <div className="ml-auto">
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                disabled={busy}
                onClick={() =>
                  run(
                    { action: "reverse", reason: reason.trim() || undefined },
                    "Withdrawal reversed",
                  )
                }
              >
                Reverse
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}