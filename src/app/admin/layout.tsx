import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/app/logo";
import { getAdminSession } from "@/lib/auth/admin";
import { ToastProvider } from "@/components/ui/toast";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminMobileNav } from "@/components/admin/mobile-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const { user } = session;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <AdminSidebar email={user.email} role={user.role} />

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
          <Link href="/admin" aria-label="RewardHub admin home">
            <Logo compact />
          </Link>
        </header>

        <AdminMobileNav />

        <main className="pb-28 pt-4 md:pb-12 md:pl-64">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}