import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { getSystemHealth, getWebhookFailures } from "@/services/admin/system";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  const url = new URL(req.url);
  const webhooks = url.searchParams.get("webhooks") === "true";

  const health = await getSystemHealth();
  if (webhooks) {
    return json({ ...health, failedWebhooks: await getWebhookFailures() });
  }
  return json(health);
});