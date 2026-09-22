import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { BellIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/app/avatar";

export function MobileHeader({
  avatarUrl,
  fullName,
  unread,
}: {
  avatarUrl: string | null;
  fullName: string | null;
  unread: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
      <Link href="/dashboard" aria-label="RewardHub home">
        <Logo compact />
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <BellIcon size={20} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <Link href="/profile" aria-label="Profile">
          <Avatar src={avatarUrl} name={fullName} size="sm" />
        </Link>
      </div>
    </header>
  );
}