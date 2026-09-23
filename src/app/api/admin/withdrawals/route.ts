import { WithdrawalStatus } from "@/generated/prisma/enums";
import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { listWithdrawals } from "@/services/admin/withdrawals";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  const url = new URL(req.url);

  const statusRaw = url.searchParams.get("status");

  const result = await listWithdrawals({
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 25),
    status: (statusRaw && statusRaw in WithdrawalStatus ? statusRaw : undefined) as
      | WithdrawalStatus
      | undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  return json(result);
});