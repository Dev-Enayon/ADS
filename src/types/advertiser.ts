import { Prisma } from "@/generated/prisma/client";

/** Standard relation include for an advertiser's billable/enabled context. */
export function advertiserContextInclude(): Prisma.AdvertiserProfileInclude {
  return {
    wallet: true,
    members: true,
  };
}

export function advertiserWithUserInclude(): Prisma.AdvertiserProfileInclude {
  return {
    user: { include: { profile: true } },
    wallet: true,
  };
}

/** Advertiser + wallet + the caller's membership, resolved for a user. */
export type AdvertiserContext = {
  advertiser: Prisma.AdvertiserProfileGetPayload<{
    include: ReturnType<typeof advertiserContextInclude>;
  }>;
  wallet: {
    id: string;
    availableBalance: number;
    totalFunded: number;
    totalAllocated: number;
    totalSpent: number;
  } | null;
  membership: {
    id: string;
    role: "OWNER" | "MANAGER" | "ANALYST";
    advertiserId: string;
    userId: string;
  };
};