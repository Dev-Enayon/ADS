"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  advertiserMobileNav,
  advertiserPrimaryNav,
  advertiserSecondaryNav,
} from "@/components/advertiser/nav";
import { NavLink } from "@/components/app/nav-link";
import { SignOutButton } from "@/components/app/sign-out-button";
import { MenuIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function AdvertiserMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const moreActive = !advertiserMobileNav.some((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {advertiserMobileNav.map((item) => (
          <NavLink key={item.href} item={item} mobile />
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="More menu"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 px-1 pb-1 pt-2 text-[11px] font-medium",
            moreActive ? "text-primary" : "text-muted",
          )}
        >
          <MenuIcon size={22} />
          More
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More menu"
            className="absolute inset-x-0 bottom-0 rounded-t-[var(--radius-lg)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-strong" />
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              More
            </p>
            <div className="grid gap-1">
              {[...advertiserPrimaryNav, ...advertiserSecondaryNav].map((item) => (
                <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-border px-2 pt-3">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-soft">
                  Business menu
                </span>
                <SignOutButton />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}