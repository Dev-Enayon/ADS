"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", { body: { email, password } });
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your RewardHub account"
      footer={
        <>
          <p>
            New to RewardHub?{" "}
            <Link
              href={searchParams.get("ref") ? `/register?ref=${searchParams.get("ref")}` : "/register"}
              className="font-semibold text-primary hover:underline"
            >
              Create an account
            </Link>
          </p>
          <p className="mt-1">
            <Link href="/forgot-password" className="text-muted hover:text-foreground hover:underline">
              Forgot your password?
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-danger-soft bg-danger-soft/60 px-3 py-2.5 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}