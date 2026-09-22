"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/app/nav";

export function NavLink({
  item,
  mobile = false,
  onNavigate,
}: {
  item: NavItem;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        mobile
          ? "flex flex-col items-center justify-center gap-1 px-1 pb-1 pt-2 text-[11px] font-medium"
          : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? mobile
            ? "text-primary"
            : "bg-primary-faint text-primary-strong"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <item.icon size={mobile ? 22 : 19} />
      {mobile ? <span>{item.label}</span> : <span>{item.label}</span>}
    </Link>
  );
}