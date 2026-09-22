import { created, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { initializeFundingSchema } from "@/schemas/advertiser";
import { initializeFunding, verifyFunding } from "@/services/funding";
import { isProd } from "@/lib/env";

/**
 * Fund an advertiser wallet / campaign.
 *
 * Dev UX: initialize + verify in a single step (the dev provider simulates
 * the external gateway). In production the provider is never self-verified,
 * so this creates a funding intent that awaits an operator/webhook.
 */
export const POST = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const campaignId = params?.id;

  const body = await readJson<unknown>(req);
  const parsed = initializeFundingSchema.safeParse({
    ...(body ?? {}),
    ...(campaignId ? { campaignId } : {}),
  });
  if (!parsed.success) throw parsed.error;

  const funding = await initializeFunding(current.user.id, parsed.data, { ip: ctx.ip });

  if (isProd) {
    return created({ funding, status: funding.status, verified: false });
  }

  const verification = await verifyFunding(current.user.id, funding.id, { ip: ctx.ip });
  return created({
    funding: { ...funding, status: verification.status, verifiedAt: verification.status === "COMPLETED" ? new Date().toISOString() : null },
    status: verification.status,
    credited: verification.credited,
  });
});