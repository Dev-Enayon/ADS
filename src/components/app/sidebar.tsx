import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { NavLink } from "@/components/app/nav-link";
import { primaryNav, secondaryNav } from "@/components/app/nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { BellIcon, LogoutIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/money";
import { maskEmail } from "@/services/referrals";

export function Sidebar({
  email,
  wallet,
  unread,
}: {
  email: string;
  wallet: { availableBalance: number } | null;
  unread: number;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link href="/dashboard" aria-label="RewardHub home">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-soft">
          Menu
        </p>
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="my-3 border-t border-border" />
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/notifications"
          className="mb-1 flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted"
        >
          <span className="flex items-center gap-3">
            <BellIcon size={18} />
            Notifications
          </span>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{maskEmail(email)}</p>
            <p className="text-xs text-muted">
              Available {wallet ? formatMoney(wallet.availableBalance) : "—"}
            </p>
          </div>
          <SignOutButton iconOnly />
        </div>
      </div>
    </aside>
  );
}

export { LogoutIcon };