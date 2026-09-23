import { json, ok, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import {
  requireAdminFromRequest,
  requireSuperAdminFromRequest,
} from "@/lib/auth/admin";
import { settingUpdateSchema } from "@/schemas/admin";
import { listSettings, updateSetting } from "@/services/admin/settings";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  return json(await listSettings());
});

export const PATCH = route({}, async (req, ctx) => {
  const current = await requireSuperAdminFromRequest(req);

  const body = await readJson<unknown>(req);
  const parsed = settingUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const result = await updateSetting({
    key: parsed.data.key,
    value: parsed.data.value,
    actorId: current.user.id,
    ip: ctx.ip,
  });
  return ok(result);
});