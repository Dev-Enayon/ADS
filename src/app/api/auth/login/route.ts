import { getRequestContext, json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { loginSchema } from "@/schemas/auth";
import { login } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";

export const POST = route(
  {
    originCheck: true,
    rateLimit: (ctx) => [
      { key: `login:${ctx.ip ?? "unknown"}`, limit: 20, windowMs: 15 * 60 * 1000 },
      { key: "login:global", limit: 200, windowMs: 60 * 1000 },
    ],
  },
  async (req) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const input = loginSchema.parse(body);
    const result = await login(input, getRequestContext(req));
    const res = json({ user: result.user });
    return setSessionCookie(res, result.token);
  },
);