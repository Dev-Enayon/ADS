import { created, json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { initializeFundingSchema } from "@/schemas/advertiser";
import { initializeFunding, listFunding, verifyFunding } from "@/services/funding";
import { isProd } from "@/lib/env";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 15);

  const list = await listFunding(current.advertiser.id, { page, pageSize });
  return json({ funding: list });
});

export const POST = route({}, async (req, ctx) => {
  const current = await requireAdvertiserFromRequest(req);
  const body = await readJson<unknown>(req);
  const parsed = initializeFundingSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const funding = await initializeFunding(current.user.id, parsed.data, { ip: ctx.ip });

  if (isProd) {
    return created({ funding, status: funding.status, verified: false });
  }

  const verification = await verifyFunding(current.user.id, funding.id, { ip: ctx.ip });
  return created({
    funding: {
      ...funding,
      status: verification.status,
      verifiedAt: verification.status === "COMPLETED" ? new Date().toISOString() : null,
    },
    status: verification.status,
    credited: verification.credited,
  });
});