import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { maskIp } from "@/lib/utils";

export const GET = route({}, async (req) => {
  const { user, sessionId } = await requireUserFromRequest(req);

  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { lastActiveAt: "desc" },
    include: { device: true },
  });

  return json({
    sessions: sessions.map((s) => ({
      id: s.id,
      isCurrent: s.id === sessionId,
      deviceName: s.device?.name ?? "Unknown device",
      ipAddress: maskIp(s.ipAddress),
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revoked: s.revokedAt != null,
    })),
  });
});