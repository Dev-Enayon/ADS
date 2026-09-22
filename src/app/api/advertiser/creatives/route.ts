import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { listCreativesForAdvertiser } from "@/services/creatives";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 24);
  const q = url.searchParams.get("q") ?? undefined;

  const list = await listCreativesForAdvertiser(current.advertiser.id, { q, page, pageSize });
  return json({ creatives: list });
});