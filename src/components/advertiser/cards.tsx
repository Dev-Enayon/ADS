import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const toneStyles = {
  default: "border-border bg-surface",
  accent: "border-primary/20 bg-primary-faint",
  danger: "border-danger/20 bg-danger-soft",
  success: "border-success/20 bg-success-soft",
} as const;

export function Panel({
  title,
  value,
  sub,
  icon,
  tone = "default",
  href,
}: {
  title: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: keyof typeof toneStyles;
  href?: string;
}) {
  const inner = (
    <div className={cn("flex items-start justify-between gap-3 rounded-2xl border p-4", toneStyles[tone])}>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{title}</p>
        <p className="mt-1.5 truncate text-xl font-bold text-foreground md:text-2xl">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
      </div>
      {icon && <span className="shrink-0 text-primary">{icon}</span>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return inner;
}

export function ProgressBar({
  value,
  tone = "primary",
}: {
  value: number;
  tone?: "primary" | "success" | "warning";
}) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const toneClass =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-strong">
      <div
        className={cn("h-full rounded-full transition-all", toneClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}