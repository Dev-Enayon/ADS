import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { verifyEmailSchema } from "@/schemas/auth";
import { verifyEmail } from "@/lib/auth/service";

export const POST = route(
  {
    originCheck: true,
    rateLimit: (ctx) => [
      { key: `verify-email:${ctx.ip ?? "unknown"}`, limit: 10, windowMs: 15 * 60 * 1000 },
    ],
  },
  async (req, ctx) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const { token } = verifyEmailSchema.parse(body);
    const result = await verifyEmail(token, ctx.ip);
    return json(result);
  },
);