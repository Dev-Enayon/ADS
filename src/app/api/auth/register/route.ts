import { readJson, created } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { registerSchema } from "@/schemas/auth";
import { register } from "@/lib/auth/service";

export const POST = route(
  {
    originCheck: true,
    rateLimit: (ctx) => [
      { key: `register:${ctx.ip ?? "unknown"}`, limit: 5, windowMs: 60 * 60 * 1000 },
    ],
  },
  async (req, ctx) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const input = registerSchema.parse(body);
    const user = await register(input, ctx);
    return created({ user });
  },
);