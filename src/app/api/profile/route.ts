import { json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { updateProfileSchema } from "@/schemas/profile";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
  return json({
    profile: {
      fullName: profile?.fullName ?? null,
      phone: profile?.phone ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      country: profile?.country ?? null,
      state: profile?.state ?? null,
      city: profile?.city ?? null,
      email: user.email,
    },
  });
});

export const PATCH = route({ originCheck: true }, async (req) => {
  const body = await readJson(req);
  if (!body) throw Errors.badRequest("Invalid request body.");
  const input = updateProfileSchema.parse(body);

  const { user } = await requireUserFromRequest(req);

  const normalized = {
    fullName: input.fullName?.trim() || null,
    phone: input.phone?.trim() || null,
    country: input.country?.trim() || null,
    state: input.state?.trim() || null,
    city: input.city?.trim() || null,
  };

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: normalized,
    create: { userId: user.id, ...normalized },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "PROFILE.UPDATED" },
  });

  return json({
    profile: {
      fullName: profile.fullName,
      phone: profile.phone,
      country: profile.country,
      state: profile.state,
      city: profile.city,
    },
  });
});