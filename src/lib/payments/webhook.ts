import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA512 webhook signatures.
 *
 * Streamers sign the RAW body with a shared secret we never expose. We
 * recompute the digest from the exact string that arrived and compare it in
 * constant time (after a length check) so byte-for-byte raw payloads are what
 * authenticate -- JSON pretty-printing or field reordering would break it.
 */

export function computeWebhookSignature(payload: string | Buffer, secret: string): string {
  return createHmac("sha512", secret).update(payload).digest("hex");
}

export function verifyWebhookSignature(
  payload: string | Buffer,
  incoming: string | null | undefined,
  secret: string,
): boolean {
  if (!incoming || !secret) return false;
  const received = incoming.startsWith("sha512=") ? incoming.slice("sha512=".length) : incoming;
  const expected = computeWebhookSignature(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature.") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}