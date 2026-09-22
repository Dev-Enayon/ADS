"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

export function ResendVerificationButton({ email }: { email: string }) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await apiFetch("/api/auth/resend-verification", { body: { email } });
      setSent(true);
      pushToast("success", "A new verification email has been sent.");
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={resend} loading={busy} disabled={sent}>
      {sent ? "Verification email sent" : "Resend verification email"}
    </Button>
  );
}