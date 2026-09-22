import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { listWithdrawals } from "@/services/withdrawals";
import { withdrawalRules } from "@/lib/settings";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const withdrawals = await listWithdrawals(user.id);
  const rules = await withdrawalRules();
  return json({ withdrawals, rules });
});