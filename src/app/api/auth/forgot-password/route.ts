import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { forgotPasswordSchema } from "@/schemas/auth";
import { requestPasswordReset } from "@/lib/auth/service";

export const POST = route(
  {
    originCheck: true,
    rateLimit: (ctx) => [
      { key: `forgot-password:${ctx.ip ?? "unknown"}`, limit: 5, windowMs: 15 * 60 * 1000 },
    ],
  },
  async (req) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const { email } = forgotPasswordSchema.parse(body);
    await requestPasswordReset(email);
    return json({ ok: true });
  },
);