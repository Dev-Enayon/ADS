"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { RoleBadge } from "@/components/advertiser/status";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; profile: { fullName: string | null } | null };
};

export function TeamManager({
  members,
  canManage,
  isOwner,
}: {
  members: Member[];
  canManage: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "MANAGER" });

  async function addMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy("add");
    try {
      await apiFetch("/api/advertiser/team", { method: "POST", body: form });
      pushToast("success", "Team member added.");
      setForm({ email: "", role: "MANAGER" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(null);
    }
  }

  async function changeRole(memberId: string, role: string) {
    if (busy) return;
    setBusy(`role-${memberId}`);
    try {
      await apiFetch(`/api/advertiser/team/${memberId}`, { method: "PATCH", body: { role } });
      pushToast("success", "Role updated.");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(null);
    }
  }

  async function remove(memberId: string) {
    if (busy) return;
    setBusy(`remove-${memberId}`);
    try {
      await apiFetch(`/api/advertiser/team/${memberId}`, { method: "DELETE" });
      pushToast("success", "Member removed.");
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(null);
    }
  }

  return (
    <>
      {canManage && (
        <div className="mb-4">
          {open ? (
            <form onSubmit={addMember} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
              <Field label="Email" htmlFor="member-email">
                <Input
                  id="member-email"
                  type="email"
                  required
                  placeholder="teammate@company.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-64"
                />
              </Field>
              <Field label="Role" htmlFor="member-role">
                <Select
                  id="member-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="MANAGER">Manager</option>
                  <option value="ANALYST">Analyst</option>
                </Select>
              </Field>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={busy === "add"}>
                  Add member
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" onClick={() => setOpen(true)}>
              Invite member
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {m.user.profile?.fullName ?? m.user.email}
              </p>
              <p className="truncate text-xs text-muted">{m.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={m.role} />
              {canManage && (
                <>
                  <Select
                    aria-label="Role"
                    className="h-9 w-auto"
                    value={m.role}
                    disabled={busy === `role-${m.id}`}
                    onChange={(e) => changeRole(m.id, e.target.value)}
                  >
                    <option value="OWNER" disabled={!isOwner}>
                      Owner
                    </option>
                    <option value="MANAGER">Manager</option>
                    <option value="ANALYST">Analyst</option>
                  </Select>
                  {m.role !== "OWNER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy === `remove-${m.id}`}
                      onClick={() => remove(m.id)}
                    >
                      Remove
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}