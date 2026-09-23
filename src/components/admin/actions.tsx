"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage, apiFetch } from "@/lib/client-api";

/** Generic admin state-change button: PATCH url with payload, toast, refresh. */
export function AdminActionButton({
  url,
  payload,
  label,
  variant = "outline",
  size = "sm",
  confirm,
  disabled,
  successMessage,
}: {
  url: string;
  payload: Record<string, unknown>;
  label: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  confirm?: string;
  disabled?: boolean;
  successMessage?: string;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      await apiFetch(url, { method: "PATCH", body: payload });
      pushToast("success", successMessage ?? label);
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={run} disabled={busy || disabled} loading={busy}>
      {busy ? "Working…" : label}
    </Button>
  );
}

/** Row editor for a single platform setting (POST/upsert + toast + refresh). */
export function SettingEditor({
  row,
}: {
  row: {
    key: string;
    value: string;
    kind: "int" | "bool" | "str";
    description: string;
    source: string;
  };
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiFetch("/api/admin/settings", { method: "PATCH", body: { key: row.key, value } });
      pushToast("success", `Saved ${row.key}`);
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-semibold text-foreground">{row.key}</p>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted">
            {row.source} · {row.kind}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{row.description}</p>
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-40"
        aria-label={`Value for ${row.key}`}
      />
      <Button size="sm" onClick={save} loading={busy} disabled={busy}>
        Save
      </Button>
    </div>
  );
}

/** Resolve form for a single risk event. */
export function RiskResolveForm({
  riskEventId,
  children,
}: {
  riskEventId: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    if (!resolution.trim()) {
      pushToast("error", "Enter a resolution before resolving.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admin/risk/${riskEventId}`, {
        method: "PATCH",
        body: { action: "resolve", resolution: resolution.trim() },
      });
      pushToast("success", "Risk event resolved");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">Resolution</p>
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        placeholder="Describe what was checked and the outcome."
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>{children}</div>
        <Button size="sm" onClick={resolve} loading={busy} disabled={busy}>
          Mark resolved
        </Button>
      </div>
    </div>
  );
}