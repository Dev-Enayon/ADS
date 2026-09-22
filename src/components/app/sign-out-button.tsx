"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { LogoutIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function SignOutButton({
  iconOnly = false,
  className,
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-label="Sign out"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:bg-surface-strong hover:text-foreground disabled:opacity-60",
        iconOnly ? "p-2" : "px-3 py-2",
        className,
      )}
    >
      <LogoutIcon size={17} />
      {!iconOnly && "Sign out"}
    </button>
  );
}