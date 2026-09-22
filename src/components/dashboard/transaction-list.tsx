import { formatMoney, formatSignedMoney } from "@/lib/money";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ArrowUpIcon,
  PlayIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";

type TransactionRow = {
  id: string;
  type: string;
  direction: string;
  amount: number;
  description: string;
  reference: string;
  createdAt: string;
  status: string;
};

const typeMeta: Record<
  string,
  { icon: React.ReactNode; iconClass: string; sign: "pos" | "neg" | "neutral" }
> = {
  REWARD: { icon: <PlayIcon size={16} />, iconClass: "bg-primary-faint text-primary-strong", sign: "pos" },
  REFERRAL_REWARD: { icon: <UsersIcon size={16} />, iconClass: "bg-info-soft text-info", sign: "pos" },
  BONUS: { icon: <WalletIcon size={16} />, iconClass: "bg-warning-soft text-warning", sign: "pos" },
  WITHDRAWAL: { icon: <ArrowUpIcon size={16} />, iconClass: "bg-danger-soft text-danger", sign: "neg" },
  REVERSAL: { icon: <WalletIcon size={16} />, iconClass: "bg-surface-strong text-muted", sign: "neutral" },
  ADJUSTMENT: { icon: <WalletIcon size={16} />, iconClass: "bg-surface-strong text-muted", sign: "neutral" },
};

export function TransactionList({
  transactions,
  emptyLabel = "No transactions yet. Complete your first sponsored video to see activity here.",
}: {
  transactions: TransactionRow[];
  emptyLabel?: string;
}) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {transactions.map((tx) => {
        const meta = typeMeta[tx.type] ?? typeMeta.ADJUSTMENT!;
        const amountCol =
          meta.sign === "pos"
            ? "text-success"
            : meta.sign === "neg"
              ? "text-foreground"
              : "text-muted";
        return (
          <li key={tx.id} className="flex items-start gap-3 py-3">
            <span
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                meta.iconClass,
              )}
            >
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{tx.description}</p>
              <p className="text-xs text-muted">
                {formatRelativeTime(tx.createdAt)} · {tx.reference}
              </p>
            </div>
            <span className={cn("shrink-0 text-sm font-semibold tabular-nums", amountCol)}>
              {meta.sign === "pos" ? formatSignedMoney(tx.amount) : `−${formatMoney(tx.amount)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}