import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { Errors } from "@/lib/errors";
import { resendVerificationSchema } from "@/schemas/auth";
import { resendVerificationEmail } from "@/lib/auth/service";
import { prisma } from "@/lib/db";

export const POST = route(
  {
    originCheck: true,
    rateLimit: (ctx) => [
      { key: `resend-verify:${ctx.ip ?? "unknown"}`, limit: 5, windowMs: 15 * 60 * 1000 },
    ],
  },
  async (req) => {
    const body = await readJson(req);
    if (!body) throw Errors.badRequest("Invalid request body.");
    const { email } = resendVerificationSchema.parse(body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (user && !user.emailVerifiedAt) {
      await resendVerificationEmail(user.id, user.email);
    }
    // Always acknowledge to avoid account enumeration.
    return json({ ok: true });
  },
);