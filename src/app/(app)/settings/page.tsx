import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { maskIp } from "@/lib/utils";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user, sessionId } = session;

  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { lastActiveAt: "desc" },
    include: { device: true },
  });

  return (
    <SettingsView
      sessions={sessions.map((s) => ({
        id: s.id,
        isCurrent: s.id === sessionId,
        deviceName: s.device?.name ?? "Unknown device",
        ipAddress: maskIp(s.ipAddress),
        lastActiveAt: s.lastActiveAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revoked: s.revokedAt != null,
      }))}
      defaultEmail={user.email}
    />
  );
}