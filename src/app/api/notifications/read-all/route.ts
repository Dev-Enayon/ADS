import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/services/notifications";

export const POST = route({ originCheck: true }, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const marked = await markAllNotificationsRead(user.id);
  return json({ ok: true, marked });
});