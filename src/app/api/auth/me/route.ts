import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { getUserFromRequest } from "@/lib/auth/session";

export const GET = route({}, async (req) => {
  const current = await getUserFromRequest(req);
  if (!current) {
    return json({ authenticated: false });
  }
  const { user } = current;
  return json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerifiedAt != null,
      referralCode: user.referralCode,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      profile: {
        fullName: user.profile?.fullName ?? null,
        avatarUrl: user.profile?.avatarUrl ?? null,
        phone: user.profile?.phone ?? null,
        country: user.profile?.country ?? null,
        state: user.profile?.state ?? null,
        city: user.profile?.city ?? null,
      },
      wallet: user.wallet
        ? {
            availableBalance: user.wallet.availableBalance,
            pendingBalance: user.wallet.pendingBalance,
          }
        : null,
    },
  });
});