import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const profile = user.profile;

  return (
    <ProfileView
      user={{
        email: user.email,
        emailVerified: user.emailVerifiedAt != null,
        createdAt: user.createdAt.toISOString(),
        fullName: profile?.fullName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        phone: profile?.phone ?? null,
        country: profile?.country ?? null,
        state: profile?.state ?? null,
        city: profile?.city ?? null,
      }}
    />
  );
}