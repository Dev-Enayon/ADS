import { Prisma } from "@/generated/prisma/client";

/** Standard included relations on a resolved user for app sessions. */
export function appUserInclude(): Prisma.UserInclude {
  return {
    profile: true,
    wallet: true,
  };
}

export type AppUserInclude = ReturnType<typeof appUserInclude>;

export type SafeUser = Prisma.UserGetPayload<{ include: AppUserInclude }>;