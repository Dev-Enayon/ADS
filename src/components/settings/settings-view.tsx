"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/utils";

type Session = {
  id: string;
  isCurrent: boolean;
  deviceName: string;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
};

export function SettingsView({
  sessions,
  defaultEmail,
}: {
  sessions: Session[];
  defaultEmail: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirm: "",
  });
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busyPassword, setBusyPassword] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (form.newPassword !== form.confirm) {
      setNotice({ tone: "danger", text: "New passwords do not match." });
      return;
    }
    setBusyPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Could not update password.");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setNotice({
        tone: "success",
        text: (data?.revokedOtherSessions ?? 0) > 0
          ? "Password updated. You were signed out of all other devices."
          : "Password updated.",
      });
      router.refresh();
    } catch (err) {
      setNotice({ tone: "danger", text: apiErrorMessage(err) });
    } finally {
      setBusyPassword(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("End this session? The device will be signed out immediately.")) return;
    setRevoking(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Could not end session.");
      router.refresh();
    } catch (err) {
      setNotice({ tone: "danger", text: apiErrorMessage(err) });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Settings</h1>
        <p className="mt-1 text-sm text-muted">Security and session management.</p>
      </div>

      {notice && (
        <Alert tone={notice.tone === "success" ? "success" : "danger"}>{notice.text}</Alert>
      )}

      <Card>
        <CardHeader
          title="Change password"
          subtitle={`Signed in as ${defaultEmail}`}
        />
        <CardBody>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password" htmlFor="currentPassword">
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                value={form.currentPassword}
                onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={form.newPassword}
                  onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm">
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={form.confirm}
                  onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
                />
              </Field>
            </div>
            <Button type="submit" loading={busyPassword}>
              Update password
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Active sessions"
          subtitle="Devices currently signed in to your account"
        />
        <CardBody>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">No active sessions.</p>
          ) : (
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {s.deviceName}
                      {s.isCurrent && <Badge tone="primary">This device</Badge>}
                      {s.revoked && <Badge tone="neutral">Revoked</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {s.ipAddress} · Last active {formatDateTime(new Date(s.lastActiveAt))}
                    </p>
                  </div>
                  {!s.isCurrent && !s.revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={revoking === s.id}
                      onClick={() => revoke(s.id)}
                    >
                      End session
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => {
                fetch("/api/auth/logout", { method: "POST" }).then(() => {
                  router.push("/login");
                  router.refresh();
                });
              }}
            >
              Sign out everywhere
            </Button>
            <p className="mt-1 text-xs text-muted">Ends every session including this one.</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}