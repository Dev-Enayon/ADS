import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { listNotifications } from "@/services/notifications";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 30);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const result = await listNotifications(user.id, { limit, offset });
  return json(result);
});