import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/services/notifications";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const unread = await unreadNotificationCount(user.id);
  return json({ unread });
});