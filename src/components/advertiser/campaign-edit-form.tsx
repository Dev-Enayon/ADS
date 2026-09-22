"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

const OBJECTIVES = [
  { value: "BRAND_AWARENESS", label: "Brand awareness" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "APP_INSTALL", label: "App installs" },
  { value: "SALES_PROMOTION", label: "Sales" },
  { value: "LEAD_GENERATION", label: "Lead generation" },
  { value: "PRODUCT_LAUNCH", label: "Product launch" },
  { value: "OTHER", label: "Other" },
];

function toNairaList(kobo: number): string {
  return String(kobo / 100);
}

function toDateLocal(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CampaignEditForm({
  campaign,
}: {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    objective: string;
    rewardPerCompletion: number;
    maxCompletions: number;
    scheduledStartAt: Date | null;
    endDate: Date | null;
    targeting: unknown;
  };
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    name: campaign.name,
    description: campaign.description ?? "",
    objective: campaign.objective,
    rewardNaira: toNairaList(campaign.rewardPerCompletion),
    maxCompletions: String(campaign.maxCompletions),
    startDate: toDateLocal(campaign.scheduledStartAt?.toISOString()),
    endDate: toDateLocal(campaign.endDate?.toISOString()),
  });

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/advertiser/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: {
          name: values.name.trim(),
          description: values.description.trim() || undefined,
          objective: values.objective,
          rewardPerCompletion: Math.round(Number(values.rewardNaira) * 100),
          maxCompletions: Number(values.maxCompletions),
          startDate: values.startDate ? new Date(values.startDate).toISOString() : null,
          endDate: values.endDate ? new Date(values.endDate).toISOString() : null,
        },
      });
      pushToast("success", "Campaign updated.");
      router.push(`/advertiser/campaigns/${campaign.id}`);
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(false);
    }
  }

  const budgetKobo =
    (Math.round(Number(values.rewardNaira || 0) * 100) || 0) * (Number(values.maxCompletions) || 0);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Campaign name" htmlFor="name">
        <Input id="name" required maxLength={120} value={values.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" maxLength={2000} value={values.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Objective" htmlFor="objective">
          <Select id="objective" value={values.objective} onChange={(e) => set("objective", e.target.value)}>
            {OBJECTIVES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reward per completion (₦)" htmlFor="rewardNaira">
          <Input id="rewardNaira" type="number" min="1" inputMode="decimal" value={values.rewardNaira} onChange={(e) => set("rewardNaira", e.target.value)} />
        </Field>
        <Field label="Target completions" htmlFor="maxCompletions">
          <Input id="maxCompletions" type="number" min="1" value={values.maxCompletions} onChange={(e) => set("maxCompletions", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="startDate" hint="Empty = launch when approved.">
          <Input id="startDate" type="datetime-local" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="End date" htmlFor="endDate">
          <Input id="endDate" type="datetime-local" value={values.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
      </div>
      <p className="text-sm text-muted">
        Budget for these values:{" "}
        <span className="font-bold text-foreground">{formatMoney(budgetKobo)}</span>. Creatives and
        targeting are managed on the campaign page.
      </p>
      <Button type="submit" loading={busy}>
        Save changes
      </Button>
    </form>
  );
}