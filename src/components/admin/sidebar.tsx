import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { NavLink } from "@/components/app/nav-link";
import { adminPrimaryNav, adminSecondaryNav } from "@/components/admin/nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { UserRoleBadge } from "@/components/admin/badges";
import { maskEmail } from "@/services/referrals";

export function AdminSidebar({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Link href="/admin" aria-label="RewardHub admin home">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-soft">
          Operations
        </p>
        {adminPrimaryNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="my-3 border-t border-border" />
        {adminSecondaryNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <div className="my-3 border-t border-border" />
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          User portal
        </Link>
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{maskEmail(email)}</p>
            <div className="mt-1">
              <UserRoleBadge role={role} />
            </div>
          </div>
          <SignOutButton iconOnly />
        </div>
      </div>
    </aside>
  );
}