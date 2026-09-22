import { cn } from "@/lib/utils";
import { formatMoney, CURRENCY_SYMBOL } from "@/lib/money";

export function MoneyCard({
  label,
  amount,
  hint,
  tone = "default",
  icon,
  className,
}: {
  label: string;
  amount: number; // kobo
  hint?: string;
  tone?: "default" | "success" | "muted" | "info";
  icon?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    muted: "text-muted",
    info: "text-info",
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <span className="text-muted-soft">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tracking-tight sm:text-[28px]", tones[tone])}>
        <span className="mr-0.5 align-middle text-base font-semibold text-muted-soft">
          {CURRENCY_SYMBOL}
        </span>
        {formatMoney(amount).replace(`${CURRENCY_SYMBOL}`, "").trim()}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}