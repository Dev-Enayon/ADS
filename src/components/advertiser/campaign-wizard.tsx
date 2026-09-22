"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const OBJECTIVES = [
  { value: "BRAND_AWARENESS", label: "Brand awareness" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "APP_INSTALL", label: "App installs" },
  { value: "SALES_PROMOTION", label: "Sales" },
  { value: "LEAD_GENERATION", label: "Lead generation" },
  { value: "PRODUCT_LAUNCH", label: "Product launch" },
  { value: "OTHER", label: "Other" },
];

const STEPS = ["Details", "Creative", "Review"];

function toKoboLocal(naira: number): number {
  return Math.round(naira * 100);
}

export function CampaignWizard() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [values, setValues] = useState({
    name: "",
    description: "",
    objective: "BRAND_AWARENESS",
    rewardNaira: "50",
    maxCompletions: "500",
    startDate: "",
    endDate: "",
    audiences: "",
    locations: "",
    ageMin: "18",
    ageMax: "65",
    genders: "",
    creativeTitle: "",
    creativeVideoUrl: "",
    creativeThumbnailUrl: "",
    creativeDuration: "15",
    creativeCtaText: "",
  });

  function forKey<K extends keyof typeof values>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));
  }

  const rewardKobo = toKoboLocal(Number(values.rewardNaira) || 0);
  const maxCompletions = Number(values.maxCompletions) || 0;
  const budgetKobo = rewardKobo * maxCompletions;
  const hasCreative = values.creativeTitle.trim() && values.creativeVideoUrl.trim().length > 0;

  const stepValid =
    step === 0
      ? values.name.trim().length >= 2 && rewardKobo > 0 && maxCompletions >= 1
      : step === 1
        ? hasCreative
        : true;

  async function submit(mode: "draft" | "submit") {
    if (busy) return;
    setBusy(mode);
    try {
      const id = campaignId ?? (await createDraftId());
      setCampaignId(id);

      if (mode === "submit") {
        await apiFetch(`/api/advertiser/campaigns/${id}/submit`, { method: "POST" });
        pushToast("success", "Campaign submitted for review.");
        router.push(`/advertiser/campaigns/${id}`);
        router.refresh();
      } else {
        pushToast("success", "Campaign draft saved.");
        router.push(`/advertiser/campaigns/${id}`);
        router.refresh();
      }
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(null);
    }
  }

  async function createDraftId(): Promise<string> {
    const body = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      objective: values.objective,
      rewardPerCompletion: rewardKobo,
      maxCompletions,
      startDate: values.startDate ? new Date(values.startDate).toISOString() : null,
      endDate: values.endDate ? new Date(values.endDate).toISOString() : null,
      targeting: {
        audiences: values.audiences
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        locations: values.locations
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        genders: values.genders
          .split(",")
          .map((s) => s.trim())
          .filter((g) => g === "male" || g === "female" || g === "other"),
        ageRange:
          values.ageMin || values.ageMax
            ? { min: Number(values.ageMin), max: Number(values.ageMax) }
            : undefined,
      },
      creative: hasCreative
        ? {
            title: values.creativeTitle.trim(),
            videoUrl: values.creativeVideoUrl.trim(),
            thumbnailUrl: values.creativeThumbnailUrl.trim() || undefined,
            durationSeconds: Number(values.creativeDuration) || 1,
            ctaText: values.creativeCtaText.trim() || undefined,
          }
        : undefined,
    };
    const res = await apiFetch<{ campaign: { id: string } }>("/api/advertiser/campaigns", {
      method: "POST",
      body,
    });
    return res.campaign.id;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          href="/advertiser/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ChevronLeftIcon size={16} />
          Back to campaigns
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">New campaign</h1>
      </div>

      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                i === step
                  ? "bg-primary text-white"
                  : i < step
                    ? "bg-success-soft text-success"
                    : "bg-surface-muted text-muted",
              )}
            >
              {i + 1}
            </span>
            <span className={cn("text-sm", i === step ? "font-semibold text-foreground" : "text-muted")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-border-strong" />}
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Campaign name" htmlFor="name">
              <Input id="name" maxLength={120} placeholder="e.g. Summer Launch Video" value={values.name} onChange={forKey("name")} />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea id="description" maxLength={2000} placeholder="What is this campaign about?" value={values.description} onChange={forKey("description")} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Objective" htmlFor="objective">
                <Select id="objective" value={values.objective} onChange={forKey("objective")}>
                  {OBJECTIVES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={`Reward per completion (₦)`} htmlFor="rewardNaira" hint="Shown to members as their earning for watching.">
                <Input
                  id="rewardNaira"
                  type="number"
                  min="1"
                  inputMode="decimal"
                  value={values.rewardNaira}
                  onChange={forKey("rewardNaira")}
                />
              </Field>

              <Field label="Target completions" htmlFor="maxCompletions" hint="How many members you want to complete the video.">
                <Input id="maxCompletions" type="number" min="1" value={values.maxCompletions} onChange={forKey("maxCompletions")} />
              </Field>
            </div>

            <div className="rounded-xl bg-surface-muted px-4 py-3 text-sm">
              <span className="text-muted">Estimated budget:</span>{" "}
              <span className="font-bold text-foreground">{formatMoney(budgetKobo)}</span>
              <span className="text-muted"> ({formatMoney(rewardKobo)} × {maxCompletions.toLocaleString()})</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="startDate" hint="Leave empty to launch immediately after approval.">
                <Input id="startDate" type="datetime-local" value={values.startDate} onChange={forKey("startDate")} />
              </Field>
              <Field label="End date" htmlFor="endDate" hint="Campaign expires automatically after this.">
                <Input id="endDate" type="datetime-local" value={values.endDate} onChange={forKey("endDate")} />
              </Field>
            </div>

            <details className="rounded-xl border border-border bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Targeting (optional)
              </summary>
              <div className="mt-4 space-y-4">
                <Field label="Audiences" htmlFor="audiences" hint="Comma-separated interests e.g. tech, music, gaming">
                  <Input id="audiences" value={values.audiences} onChange={forKey("audiences")} />
                </Field>
                <Field label="Locations" htmlFor="locations" hint="Comma-separated cities or regions e.g. Lagos, Abuja">
                  <Input id="locations" value={values.locations} onChange={forKey("locations")} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Genders" htmlFor="genders" hint="Comma-separated">
                    <Input id="genders" placeholder="male, female" value={values.genders} onChange={forKey("genders")} />
                  </Field>
                  <Field label="Min age" htmlFor="ageMin">
                    <Input id="ageMin" type="number" min="13" max="100" value={values.ageMin} onChange={forKey("ageMin")} />
                  </Field>
                  <Field label="Max age" htmlFor="ageMax">
                    <Input id="ageMax" type="number" min="13" max="100" value={values.ageMax} onChange={forKey("ageMax")} />
                  </Field>
                </div>
              </div>
            </details>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Creative title" htmlFor="creativeTitle">
              <Input id="creativeTitle" maxLength={120} placeholder="e.g. 15s Summer Launch Teaser" value={values.creativeTitle} onChange={forKey("creativeTitle")} />
            </Field>
            <Field label="Video URL" htmlFor="creativeVideoUrl" hint="Host the video on an http(s) URL. Its duration is verified before publishing.">
              <Input id="creativeVideoUrl" type="url" placeholder="https://cdn.example.com/video.mp4" value={values.creativeVideoUrl} onChange={forKey("creativeVideoUrl")} />
            </Field>
            <Field label="Thumbnail URL" htmlFor="creativeThumbnailUrl">
              <Input id="creativeThumbnailUrl" type="url" placeholder="https://cdn.example.com/thumb.jpg" value={values.creativeThumbnailUrl} onChange={forKey("creativeThumbnailUrl")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration (seconds)" htmlFor="creativeDuration" hint="Must be between 8 and 120 seconds.">
                <Input id="creativeDuration" type="number" min="1" max="3600" value={values.creativeDuration} onChange={forKey("creativeDuration")} />
              </Field>
              <Field label="Call to action" htmlFor="creativeCtaText" hint="e.g. Install now, Learn more">
                <Input id="creativeCtaText" maxLength={40} placeholder="Install now" value={values.creativeCtaText} onChange={forKey("creativeCtaText")} />
              </Field>
            </div>
            {values.creativeVideoUrl.trim() && !values.creativeTitle.trim() && (
              <p className="text-xs font-medium text-warning">Creative title is required before submitting.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Name</dt>
                <dd className="font-medium text-foreground">{values.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Objective</dt>
                <dd className="font-medium text-foreground">{values.objective}</dd>
              </div>
              <div>
                <dt className="text-muted">Reward / completion</dt>
                <dd className="font-medium text-foreground">{formatMoney(rewardKobo)}</dd>
              </div>
              <div>
                <dt className="text-muted">Target completions</dt>
                <dd className="font-medium text-foreground">{maxCompletions.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted">Budget</dt>
                <dd className="font-medium text-foreground">{formatMoney(budgetKobo)}</dd>
              </div>
              <div>
                <dt className="text-muted">Creative</dt>
                <dd className="font-medium text-foreground">
                  {hasCreative ? values.creativeTitle : <Badge tone="warning">No creative yet</Badge>}
                </dd>
              </div>
            </dl>

            <div className="rounded-xl bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning">
              <p>
                Submitting for review publishes the campaign (and allocates its budget from your
                wallet when approved). A draft can be edited before submission.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || busy !== null}
          >
            Back
          </Button>

          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid}>
                Continue
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  loading={busy === "draft"}
                  disabled={busy !== null}
                  onClick={() => submit("draft")}
                >
                  Save draft
                </Button>
                <Button
                  loading={busy === "submit"}
                  disabled={busy !== null || !hasCreative}
                  onClick={() => submit("submit")}
                >
                  Submit for review
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}