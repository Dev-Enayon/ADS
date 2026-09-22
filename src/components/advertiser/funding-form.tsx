"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

export function FundingForm({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [naira, setNaira] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const amount = Math.round(Number(naira || 0) * 100);
      const res = await apiFetch<{ credited?: boolean; status?: string }>(
        campaignId
          ? `/api/advertiser/campaigns/${campaignId}/fund`
          : "/api/advertiser/funding",
        { method: "POST", body: { amount, ...(campaignId ? {} : {}) } },
      );
      pushToast(
        "success",
        res.credited === false
          ? `Funding of ${formatMoney(amount)} recorded. Awaiting payment confirmation.`
          : `${formatMoney(amount)} added to your wallet.`,
      );
      setNaira("");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Amount (₦)" htmlFor="fund-amount">
        <Input
          id="fund-amount"
          type="number"
          min="1"
          step="0.01"
          inputMode="decimal"
          required
          placeholder="e.g. 5000"
          value={naira}
          onChange={(e) => setNaira(e.target.value)}
          className="w-48"
        />
      </Field>
      <Button type="submit" loading={busy}>
        {campaignId ? "Fund campaign" : "Add funds"}
      </Button>
    </form>
  );
}