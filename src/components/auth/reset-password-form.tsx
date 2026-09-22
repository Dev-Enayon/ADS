"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { Alert } from "@/components/ui/alert";
import { CheckIcon } from "@/components/ui/icons";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/reset-password", { body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard
        title="Password updated"
        subtitle="You can now sign in with your new password"
        footer={
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckIcon size={24} />
          </span>
        </div>
        <Button
          className="mt-6 w-full"
          size="lg"
          onClick={() => {
            router.push("/login");
            router.refresh();
          }}
        >
          Continue
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Set a strong, unique password for your account"
      footer={
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-danger-soft bg-danger-soft/60 px-3 py-2.5 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export function InvalidToken() {
  return (
    <AuthCard
      title="Invalid reset link"
      subtitle="This link is invalid or has expired"
      footer={
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Request a new link
        </Link>
      }
    >
      <Alert tone="danger">
        The password reset link you used is invalid or has already been used. Please request a
        new one.
      </Alert>
    </AuthCard>
  );
}