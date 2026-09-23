import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { WebhookSignatureError } from "@/lib/payments/webhook";
import { processPayoutWebhook } from "@/services/payouts/webhook-handler";

/**
 * Provider payout webhook receiver.
 *
 * Deliberately a plain handler (no `route()` wrapper): providers call this
 * without cookies, browser Origin, or maintenance-mode concerns. The raw body
 * is read as text for HMAC verification -- never JSON-parsed first.
 *
 * Signature headers: `x-payout-signature` (preferred) or `x-hub-signature`,
 * value `sha512=<hex>`.
 */
async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-payout-signature") ?? req.headers.get("x-hub-signature");

    const result = await processPayoutWebhook({
      rawBody,
      signature,
      secret: env.payoutWebhookSecret,
      provider: env.payoutProvider,
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return Response.json({ error: { code: "INVALID_SIGNATURE", message: err.message } }, { status: 401 });
    }
    if (err instanceof AppError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("[webhook:payout] processing error", err instanceof Error ? err.message : err);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Webhook processing failed." } }, { status: 500 });
  }
}

export { handle as POST };
export { handle as PUT };