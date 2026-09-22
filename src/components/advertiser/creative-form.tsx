"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PlusIcon } from "@/components/ui/icons";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";

export function CreativeForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    title: "",
    videoUrl: "",
    thumbnailUrl: "",
    durationSeconds: "15",
    description: "",
    ctaText: "",
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/advertiser/campaigns/${campaignId}/creative`, {
        method: "POST",
        body: {
          title: values.title.trim(),
          videoUrl: values.videoUrl.trim(),
          thumbnailUrl: values.thumbnailUrl.trim() || undefined,
          durationSeconds: Number(values.durationSeconds) || 1,
          ctaText: values.ctaText.trim() || undefined,
        },
      });
      pushToast("success", "Creative added.");
      setValues({ title: "", videoUrl: "", thumbnailUrl: "", durationSeconds: "15", description: "", ctaText: "" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon size={15} />
        Add creative
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="creative-title">
          <Input
            id="creative-title"
            required
            maxLength={120}
            placeholder="Creative title"
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          />
        </Field>
        <Field label="Duration (seconds)" htmlFor="creative-duration">
          <Input
            id="creative-duration"
            type="number"
            min="1"
            value={values.durationSeconds}
            onChange={(e) => setValues((v) => ({ ...v, durationSeconds: e.target.value }))}
          />
        </Field>
      </div>
      <Field label="Video URL" htmlFor="creative-video">
        <Input
          id="creative-video"
          type="url"
          required
          placeholder="https://cdn.example.com/video.mp4"
          value={values.videoUrl}
          onChange={(e) => setValues((v) => ({ ...v, videoUrl: e.target.value }))}
        />
      </Field>
      <Field label="Thumbnail URL (optional)" htmlFor="creative-thumb">
        <Input
          id="creative-thumb"
          type="url"
          placeholder="https://cdn.example.com/thumb.jpg"
          value={values.thumbnailUrl}
          onChange={(e) => setValues((v) => ({ ...v, thumbnailUrl: e.target.value }))}
        />
      </Field>
      <Field label="Call to action (optional)" htmlFor="creative-cta">
        <Input
          id="creative-cta"
          maxLength={40}
          placeholder="Install now"
          value={values.ctaText}
          onChange={(e) => setValues((v) => ({ ...v, ctaText: e.target.value }))}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Save creative
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}