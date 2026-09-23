import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { getFinancialSummary } from "@/services/admin/financials";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  return json(await getFinancialSummary());
});