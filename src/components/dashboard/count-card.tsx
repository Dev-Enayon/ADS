import { cn } from "@/lib/utils";

export function CountCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "success";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5",
        className,
      )}
    >
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={cn("mt-2 text-2xl font-bold tracking-tight sm:text-[28px]", tone === "success" ? "text-success" : "text-foreground")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}