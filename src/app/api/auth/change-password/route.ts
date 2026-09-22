import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { changePasswordSchema } from "@/schemas/auth";
import { changePassword } from "@/lib/auth/service";
import { requireUserFromRequest } from "@/lib/auth/session";

export const POST = route(
  { originCheck: true },
  async (req) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const input = changePasswordSchema.parse(body);
    const { user, sessionId } = await requireUserFromRequest(req);
    const revoked = await changePassword(
      user.id,
      input.currentPassword,
      input.newPassword,
      sessionId,
    );
    return json({ ok: true, revokedOtherSessions: revoked });
  },
);