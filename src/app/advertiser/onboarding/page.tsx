import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { OnboardingForm } from "@/components/advertiser/onboarding-form";
import { ToastProvider } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10">
        {children}
      </div>
    </ToastProvider>
  );
}

export default async function AdvertiserOnboardingPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const ctx = await getAdvertiserContext(session.user.id);
  if (ctx) redirect("/advertiser/dashboard");

  return (
    <Shell>
      <div className="mb-8 space-y-2">
        <Badge tone="primary">Advertiser</Badge>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Set up your business to run campaigns
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Create your advertiser profile, fund your wallet, and start publishing
          sponsored video campaigns that RewardHub members watch to earn.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <OnboardingForm />
      </div>
    </Shell>
  );
}