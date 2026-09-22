"use client";

import { formatMoney } from "@/lib/money";

export type ChartCampaign = {
  id: string;
  name: string;
  status: string;
  budget: number;
  allocated: number;
  remaining: number;
  spent: number;
  completions: number;
  maxCompletions: number;
  startedViews: number;
  completedViews: number;
  completionRate: number;
  spendPercent: number;
};

export function AnalyticsCharts({ campaigns }: { campaigns: ChartCampaign[] }) {
  if (campaigns.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No campaigns to chart yet.</p>;
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Campaign breakdown</h2>
      <div className="space-y-4">
        {campaigns.map((c) => (
          <div key={c.id}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="min-w-0 truncate font-medium text-foreground">{c.name}</span>
              <span className="ml-3 shrink-0 text-xs text-muted">
                {formatMoney(c.spent)} of {formatMoney(c.allocated)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-strong">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(Math.max(c.spendPercent, 0), 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {c.startedViews.toLocaleString()} views started · {c.completedViews.toLocaleString()}{" "}
              completed · {c.completions.toLocaleString()} / {c.maxCompletions.toLocaleString()}{" "}
              completions · {c.completionRate}% finish rate
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}