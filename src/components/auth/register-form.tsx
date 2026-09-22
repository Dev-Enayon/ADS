"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { Alert } from "@/components/ui/alert";

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? "";

  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    referralCode: ref,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/auth/register", {
        body: {
          email: form.email,
          password: form.password,
          fullName: form.fullName || undefined,
          referralCode: form.referralCode || undefined,
        },
      });
      setRegistered(true);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  if (registered) {
    return (
      <AuthCard
        title="Account created"
        subtitle="One more step before you can start earning"
        footer={
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in instead
          </Link>
        }
      >
        <Alert tone="success">
          We&apos;ve sent a verification link to <strong>{form.email}</strong>. Open it to
          activate your account. (In development the link is printed in the server console.)
        </Alert>
        <div className="mt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/login")}
          >
            Continue to sign in
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start earning verified rewards"
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href={ref ? `/login?ref=${encodeURIComponent(ref)}` : "/login"}
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-danger-soft bg-danger-soft/60 px-3 py-2.5 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        {ref && (
          <div className="rounded-[var(--radius-sm)] border border-info-soft bg-info-soft/60 px-3 py-2.5 text-xs font-medium text-info">
            You were invited with referral code <strong>{ref}</strong>.
          </div>
        )}
        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update("email")}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Full name" htmlFor="fullName">
          <Input
            id="fullName"
            autoComplete="name"
            value={form.fullName}
            onChange={update("fullName")}
            placeholder="e.g. Ada Nwosu"
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters. Use a unique password."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={update("password")}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Referral code (optional)" htmlFor="referralCode">
          <Input
            id="referralCode"
            value={form.referralCode}
            onChange={update("referralCode")}
            placeholder="RH........"
            className="uppercase"
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted">
          By creating an account you agree to our terms of service and privacy policy.
        </p>
      </form>
    </AuthCard>
  );
}