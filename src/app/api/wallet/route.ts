import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/stats";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const stats = await getDashboardStats(user.id);
  return json({ stats });
});