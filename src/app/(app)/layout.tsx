import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/services/notifications";
import { ToastProvider } from "@/components/ui/toast";
import { Sidebar } from "@/components/app/sidebar";
import { MobileNav } from "@/components/app/mobile-nav";
import { MobileHeader } from "@/components/app/mobile-header";
import { StatusBanner } from "@/components/app/status-banner";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/login");
  }

  const { user } = session;
  const unread = await unreadNotificationCount(user.id);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <Sidebar
          email={user.email}
          wallet={user.wallet}
          unread={unread}
        />
        <MobileHeader
          avatarUrl={user.profile?.avatarUrl ?? null}
          fullName={user.profile?.fullName ?? null}
          unread={unread}
        />
        <MobileNav unread={unread} />

        <main className="pb-28 pt-4 md:pb-12 md:pl-64">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <StatusBanner
              status={user.status}
              emailVerified={user.emailVerifiedAt != null}
              email={user.email}
            />
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}