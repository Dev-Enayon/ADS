import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { logout } from "@/lib/auth/service";
import { requireUserFromRequest } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/session";

export const POST = route(
  { originCheck: true },
  async (req, ctx) => {
    const { sessionId } = await requireUserFromRequest(req);
    await logout(sessionId, ctx.ip);
    return clearSessionCookie(json({ ok: true }));
  },
);