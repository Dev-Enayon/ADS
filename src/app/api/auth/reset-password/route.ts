import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { resetPasswordSchema } from "@/schemas/auth";
import { resetPassword } from "@/lib/auth/service";

export const POST = route(
  {
    originCheck: true,
    rateLimit: (ctx) => [
      { key: `reset-password:${ctx.ip ?? "unknown"}`, limit: 5, windowMs: 15 * 60 * 1000 },
    ],
  },
  async (req, ctx) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const { token, password } = resetPasswordSchema.parse(body);
    await resetPassword(token, password, ctx.ip);
    return json({ ok: true });
  },
);