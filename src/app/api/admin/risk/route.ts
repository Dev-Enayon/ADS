import { RiskEventType } from "@/generated/prisma/enums";
import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { listRiskEvents, riskSummary } from "@/services/admin/risk";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  const url = new URL(req.url);

  const typeRaw = url.searchParams.get("type");
  const summaryOnly = url.searchParams.get("summary") === "true";

  if (summaryOnly) {
    return json(await riskSummary());
  }

  const result = await listRiskEvents({
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 25),
    resolved:
      url.searchParams.get("resolved") === "true"
        ? true
        : url.searchParams.get("resolved") === "false"
          ? false
          : undefined,
    type: (typeRaw && typeRaw in RiskEventType ? typeRaw : undefined) as RiskEventType | undefined,
    severity: url.searchParams.get("severity") ?? undefined,
  });
  return json(result);
});