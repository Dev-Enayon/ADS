import { created, json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { campaignInputSchema, campaignListQuerySchema } from "@/schemas/advertiser";
import { createCampaign, listCampaigns } from "@/services/campaigns";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const url = new URL(req.url);
  const parsed = campaignListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });
  if (!parsed.success) throw parsed.error;

  const list = await listCampaigns(current.advertiser.id, parsed.data);
  return json({ campaigns: list });
});

export const POST = route({}, async (req, ctx) => {
  const current = await requireAdvertiserFromRequest(req);
  const body = await readJson<unknown>(req);
  const parsed = campaignInputSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const result = await createCampaign(current.user.id, parsed.data, { ip: ctx.ip });
  return created(result);
});