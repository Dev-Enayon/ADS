import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { cancelWithdrawal } from "@/services/withdrawals";

export const POST = route({ originCheck: true }, async (req, _ctx, routeCtx) => {
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) throw Errors.badRequest("Missing withdrawal id.");

  const { user } = await requireUserFromRequest(req);
  const withdrawal = await cancelWithdrawal(user.id, id);
  return json({ withdrawal });
});