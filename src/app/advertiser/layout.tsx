import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { ToastProvider } from "@/components/ui/toast";
import { AdvertiserSidebar } from "@/components/advertiser/sidebar";
import { AdvertiserMobileNav } from "@/components/advertiser/mobile-nav";
import { AdvertiserStatusBadge } from "@/components/advertiser/status";

export const dynamic = "force-dynamic";

export default async function AdvertiserLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const { user } = session;
  const ctx = await getAdvertiserContext(user.id);
  if (!ctx) redirect("/advertiser/onboarding");

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <AdvertiserSidebar
          email={user.email}
          businessName={ctx.advertiser.businessName}
          wallet={ctx.wallet}
        />

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
          <Link href="/advertiser/dashboard" aria-label="RewardHub advertiser home">
            <Logo compact />
          </Link>
          <AdvertiserStatusBadge status={ctx.advertiser.status} />
        </header>

        <AdvertiserMobileNav />

        <main className="pb-28 pt-4 md:pb-12 md:pl-64">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            {ctx.advertiser.status !== "ACTIVE" && (
              <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
                Your advertiser account is {ctx.advertiser.status.replace("_", " ").toLowerCase()}. You can prepare campaigns, but they cannot go live until the account is approved.
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}