"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";

export function ProfileForm({
  profile,
}: {
  profile: {
    businessName: string;
    businessEmail: string;
    businessPhone: string | null;
    category: string | null;
    website: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    businessDescription: string | null;
  };
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    businessName: profile.businessName,
    businessEmail: profile.businessEmail,
    businessPhone: profile.businessPhone ?? "",
    category: profile.category ?? "",
    website: profile.website ?? "",
    country: profile.country ?? "",
    state: profile.state ?? "",
    city: profile.city ?? "",
    businessDescription: profile.businessDescription ?? "",
  });

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/advertiser/profile", {
        method: "PATCH",
        body: {
          businessName: values.businessName.trim(),
          businessEmail: values.businessEmail.trim(),
          businessPhone: values.businessPhone.trim() || undefined,
          website: values.website.trim() || undefined,
          category: values.category.trim() || undefined,
          country: values.country.trim() || undefined,
          state: values.state.trim() || undefined,
          city: values.city.trim() || undefined,
          businessDescription: values.businessDescription.trim() || undefined,
        },
      });
      pushToast("success", "Profile updated.");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="businessName">
          <Input id="businessName" required maxLength={120} value={values.businessName} onChange={(e) => set("businessName", e.target.value)} />
        </Field>
        <Field label="Business email" htmlFor="businessEmail">
          <Input id="businessEmail" type="email" required maxLength={200} value={values.businessEmail} onChange={(e) => set("businessEmail", e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="businessPhone">
          <Input id="businessPhone" value={values.businessPhone} onChange={(e) => set("businessPhone", e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="category">
          <Select id="category" value={values.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Select a category</option>
            {[
              "Business & Services",
              "Food & Beverages",
              "Fashion & Beauty",
              "Technology & Apps",
              "Education",
              "Entertainment & Media",
              "Finance & Fintech",
              "Health & Wellness",
              "Retail & E-commerce",
              "Travel & Hospitality",
              "Real Estate",
              "Other",
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website" htmlFor="website">
          <Input id="website" type="url" value={values.website} onChange={(e) => set("website", e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Country" htmlFor="country">
            <Input id="country" maxLength={3} value={values.country} onChange={(e) => set("country", e.target.value.toUpperCase())} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" value={values.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" value={values.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Business description" htmlFor="businessDescription">
        <Textarea id="businessDescription" maxLength={1000} value={values.businessDescription} onChange={(e) => set("businessDescription", e.target.value)} />
      </Field>
      <Button type="submit" loading={busy}>
        Save changes
      </Button>
    </form>
  );
}