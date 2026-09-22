"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";

const categories = [
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
];

export function OnboardingForm() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    category: "",
    website: "",
    city: "",
    state: "",
    country: "NG",
    businessDescription: "",
  });

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/advertiser/profile", { method: "POST", body: values });
      pushToast("success", "Advertiser account created. It will be activated shortly.");
      router.push("/advertiser/dashboard");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="businessName">
          <Input
            id="businessName"
            required
            maxLength={120}
            placeholder="e.g. Acme Foods Ltd"
            value={values.businessName}
            onChange={(e) => set("businessName", e.target.value)}
          />
        </Field>

        <Field label="Business email" htmlFor="businessEmail" hint="Used for campaign correspondence.">
          <Input
            id="businessEmail"
            type="email"
            required
            maxLength={200}
            placeholder="hello@acme.com"
            value={values.businessEmail}
            onChange={(e) => set("businessEmail", e.target.value)}
          />
        </Field>

        <Field label="Phone" htmlFor="businessPhone">
          <Input
            id="businessPhone"
            maxLength={30}
            placeholder="+234 800 000 0000"
            value={values.businessPhone}
            onChange={(e) => set("businessPhone", e.target.value)}
          />
        </Field>

        <Field label="Category" htmlFor="category">
          <Select
            id="category"
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Website" htmlFor="website">
          <Input
            id="website"
            type="url"
            placeholder="https://acme.com"
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </Field>

        <Field label="City" htmlFor="city">
          <Input
            id="city"
            placeholder="Lagos"
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>

        <Field label="State" htmlFor="state">
          <Input
            id="state"
            placeholder="Lagos"
            value={values.state}
            onChange={(e) => set("state", e.target.value)}
          />
        </Field>

        <Field label="Country" htmlFor="country">
          <Input
            id="country"
            maxLength={3}
            placeholder="NG"
            value={values.country}
            onChange={(e) => set("country", e.target.value.toUpperCase())}
          />
        </Field>
      </div>

      <Field label="Tell us about your business" htmlFor="businessDescription">
        <Textarea
          id="businessDescription"
          maxLength={1000}
          placeholder="What does your business offer, and what kinds of audiences are you hoping to reach?"
          value={values.businessDescription}
          onChange={(e) => set("businessDescription", e.target.value)}
        />
      </Field>

      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        Create advertiser account
      </Button>
    </form>
  );
}