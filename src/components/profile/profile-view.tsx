"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/app/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/client-api";
import { formatDate } from "@/lib/utils";

export function ProfileView({
  user,
}: {
  user: {
    email: string;
    emailVerified: boolean;
    createdAt: string;
    fullName: string | null;
    avatarUrl: string | null;
    phone: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: user.fullName ?? "",
    phone: user.phone ?? "",
    country: user.country ?? "",
    state: user.state ?? "",
    city: user.city ?? "",
  });
  const [avatar, setAvatar] = useState<string | null>(user.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Could not save your profile.");
      }
      setMessage({ tone: "success", text: "Profile saved." });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: apiErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function upload(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("avatar", f);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Could not upload your avatar.");
      }
      setAvatar(data.avatarUrl);
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: apiErrorMessage(err) });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Profile</h1>
        <p className="mt-1 text-sm text-muted">Your public details and account info.</p>
      </div>

      {message && (
        <Alert tone={message.tone === "success" ? "success" : "danger"}>{message.text}</Alert>
      )}

      <Card>
        <CardHeader title="Photo" />
        <CardBody>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar src={avatar} name={form.fullName} size="lg" />
            <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                {avatar ? "Change photo" : "Upload photo"}
              </Button>
              <p className="text-xs text-muted">PNG, JPEG or WebP up to 2MB.</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Personal information" />
        <CardBody>
          <form onSubmit={save} className="space-y-4">
            <Field label="Email (read-only)" htmlFor="email">
              <Input id="email" value={user.email} disabled />
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone={user.emailVerified ? "success" : "warning"}>
                {user.emailVerified ? "Verified" : "Unverified"}
              </Badge>
              <span>Joined {formatDate(new Date(user.createdAt))}</span>
            </div>
            <Field label="Full name" htmlFor="fullName">
              <Input id="fullName" value={form.fullName} onChange={update("fullName")} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" inputMode="tel" value={form.phone} onChange={update("phone")} />
              </Field>
              <Field label="Country" htmlFor="country">
                <Input id="country" value={form.country} onChange={update("country")} />
              </Field>
              <Field label="State" htmlFor="state">
                <Input id="state" value={form.state} onChange={update("state")} />
              </Field>
              <Field label="City" htmlFor="city">
                <Input id="city" value={form.city} onChange={update("city")} />
              </Field>
            </div>
            <div className="pt-2">
              <Button type="submit" loading={saving} size="lg" className="w-full sm:w-auto">
                Save changes
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}