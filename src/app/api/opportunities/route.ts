import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { listOpportunities } from "@/services/opportunities";

export const GET = route({}, async (req) => {
  const { user } = await requireUserFromRequest(req);
  const opportunities = await listOpportunities(user.id);
  return json({ opportunities });
});