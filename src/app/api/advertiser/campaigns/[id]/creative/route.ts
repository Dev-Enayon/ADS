import { created, json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { creativeInputSchema } from "@/schemas/advertiser";
import { createCreative } from "@/services/creatives";

export const POST = route({}, async (req, ctx, routeCtx) => {
  const current = await requireAdvertiserFromRequest(req);
  const params = await routeCtx?.params;
  const id = params?.id;
  if (!id) return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);

  const body = await readJson<unknown>(req);
  const parsed = creativeInputSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const creative = await createCreative(current.user.id, id, parsed.data, { ip: ctx.ip });
  return created({ creative });
});