import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { listCampaigns } from "@/services/admin/campaigns";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  const url = new URL(req.url);

  const result = await listCampaigns({
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 25),
    status: url.searchParams.get("status") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  return json(result);
});