import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info-soft bg-info-soft/60 text-foreground",
    success: "border-success-soft bg-success-soft/60 text-foreground",
    warning: "border-warning-soft bg-warning-soft/60 text-foreground",
    danger: "border-danger-soft bg-danger-soft/60 text-foreground",
  };
  return (
    <div className={cn("rounded-[var(--radius-sm)] border px-4 py-3 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border-strong px-6 py-12 text-center">
      {icon && <div className="text-muted-soft">{icon}</div>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {actionLabel && onAction && (
        <Button className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}