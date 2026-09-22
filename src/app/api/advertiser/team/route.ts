import { created, json, readJson } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdvertiserFromRequest } from "@/lib/auth/advertiser";
import { addMemberSchema } from "@/schemas/advertiser";
import { addMember, listMembers } from "@/services/advertisers";

export const GET = route({}, async (req) => {
  const current = await requireAdvertiserFromRequest(req);
  const members = await listMembers(current.advertiser.id);
  return json({ members });
});

export const POST = route({}, async (req, ctx) => {
  const current = await requireAdvertiserFromRequest(req);
  const body = await readJson<unknown>(req);
  const parsed = addMemberSchema.safeParse(body ?? {});
  if (!parsed.success) throw parsed.error;

  const member = await addMember(current.user.id, parsed.data, { ip: ctx.ip });
  return created({ member });
});