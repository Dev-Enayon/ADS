import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { withdrawalActionSchema } from "@/schemas/admin";
import {
  dispatchWithdrawal,
  failWithdrawalAdmin,
  getWithdrawalDetail,
  reverseWithdrawalAdmin,
  settleWithdrawalManually,
} from "@/services/admin/withdrawals";

export const GET = route({}, async (req, _ctx, routeCtx) => {
  await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const withdrawalId = params?.id;
  if (!withdrawalId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const detail = await getWithdrawalDetail(withdrawalId);
  return json(detail);
});

export const PATCH = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdminFromRequest(req);
  const params = await routeCtx?.params;
  const withdrawalId = params?.id;
  if (!withdrawalId) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = withdrawalActionSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  switch (parsed.data.action) {
    case "dispatch": {
      const result = await dispatchWithdrawal({ withdrawalId, actorId: current.user.id, ip: ctx.ip });
      return ok({ action: "dispatched", ...result });
    }
    case "settle": {
      const result = await settleWithdrawalManually({
        withdrawalId,
        actorId: current.user.id,
        providerRef: parsed.data.providerRef,
        ip: ctx.ip,
      });
      return ok({ action: "settled", ...result });
    }
    case "fail": {
      const result = await failWithdrawalAdmin({
        withdrawalId,
        actorId: current.user.id,
        reason: parsed.data.reason,
        ip: ctx.ip,
      });
      return ok({ action: "failed", ...result });
    }
    case "reverse": {
      const result = await reverseWithdrawalAdmin({
        withdrawalId,
        actorId: current.user.id,
        reason: parsed.data.reason,
        ip: ctx.ip,
      });
      return ok({ action: "reversed", ...result });
    }
  }
});