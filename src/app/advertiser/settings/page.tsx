import { getCurrentUser } from "@/lib/auth/session";
import { getAdvertiserContext } from "@/lib/auth/advertiser";
import { getAdvertiserOwnProfile } from "@/services/advertisers";
import { PageHeader } from "@/components/advertiser/cards";
import { ProfileForm } from "@/components/advertiser/profile-form";
import { AdvertiserStatusBadge } from "@/components/advertiser/status";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdvertiserSettingsPage() {
  const session = await getCurrentUser();
  const ctx = await getAdvertiserContext(session!.user.id);
  if (!ctx) return null;

  const profile = await getAdvertiserOwnProfile(ctx.advertiser.id);
  if (!profile) return null;

  return (
    <>
      <PageHeader
        title="Account settings"
        subtitle="Business details are shown on your advertiser profile."
        actions={<AdvertiserStatusBadge status={ctx.advertiser.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <ProfileForm
              profile={{
                businessName: profile.businessName,
                businessEmail: profile.businessEmail,
                businessPhone: profile.businessPhone,
                category: profile.category,
                website: profile.website,
                country: profile.country,
                state: profile.state,
                city: profile.city,
                businessDescription: profile.businessDescription,
              }}
            />
          </div>
        </section>

        {profile.wallet && (
          <aside className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Wallet</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Available</dt>
                  <dd className="font-medium text-foreground">{formatMoney(profile.wallet.availableBalance)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Total funded</dt>
                  <dd className="font-medium text-foreground">{formatMoney(profile.wallet.totalFunded)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Allocated</dt>
                  <dd className="font-medium text-foreground">{formatMoney(profile.wallet.totalAllocated)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Spent</dt>
                  <dd className="font-medium text-foreground">{formatMoney(profile.wallet.totalSpent)}</dd>
                </div>
              </dl>
            </div>
            <p className="px-1 text-xs text-muted">
              Connected as <span className="font-medium text-foreground">{profile.user.email}</span>
            </p>
          </aside>
        )}
      </div>
    </>
  );
}