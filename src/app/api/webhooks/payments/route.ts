import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { WebhookSignatureError } from "@/lib/payments/webhook";
import { processPaymentWebhook } from "@/services/payments/funding-webhook";

/**
 * Provider payment (campaign funding) webhook receiver. Same rules as the
 * payout receiver: raw body for HMAC, signature first, no session/origin.
 *
 * Signature headers: `x-payment-signature` (preferred) or `x-hub-signature`.
 */
async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-payment-signature") ?? req.headers.get("x-hub-signature");

    const result = await processPaymentWebhook({
      rawBody,
      signature,
      secret: env.paymentWebhookSecret,
      provider: env.paymentProvider,
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return Response.json({ error: { code: "INVALID_SIGNATURE", message: err.message } }, { status: 401 });
    }
    if (err instanceof AppError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("[webhook:payment] processing error", err instanceof Error ? err.message : err);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Webhook processing failed." } }, { status: 500 });
  }
}

export { handle as POST };
export { handle as PUT };