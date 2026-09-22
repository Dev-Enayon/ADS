"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Live" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_REVIEW", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REJECTED", label: "Rejected" },
];

export function CampaignFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v && v !== "ALL") params.set(k, v);
      else params.delete(k);
    }
    router.push(`/advertiser/campaigns${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Input
        aria-label="Search campaigns"
        placeholder="Search campaigns…"
        className="h-10 max-w-xs"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ q: q.trim() });
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((opt) => {
          const active = (searchParams.get("status") ?? "ALL") === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => apply({ status: opt.value })}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-primary text-white"
                  : "bg-surface-muted text-muted hover:bg-surface-strong hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <Select
        aria-label="Sort campaigns"
        className="h-10 w-auto"
        value={searchParams.get("sort") ?? "newest"}
        onChange={(e) => apply({ sort: e.target.value })}
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="budget">Biggest budget</option>
        <option value="spend">Most spent</option>
      </Select>
    </div>
  );
}