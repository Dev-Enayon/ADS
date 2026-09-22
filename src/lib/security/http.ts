import "server-only";

import { Errors } from "@/lib/errors";
import { isProd } from "@/lib/env";

/**
 * CSRF defence for state-changing requests.
 *
 * We use SameSite=Lax httpOnly cookies and this origin check as a second
 * layer: for any mutation we require the Origin (or Referer) header to match
 * the configured application origin when present. Same-origin browser
 * requests always send Origin on fetch POSTs; cross-site frames cannot forge
 * a matching origin.
 */
export function assertSafeOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin ?? referer;
  if (!source) {
    // Non-browser clients (curl, servers) do not send Origin; allow.
    return;
  }
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const allowedOrigins = new Set<string>();
  const host = new URL(appUrl).host;
  allowedOrigins.add(`http://${host}`);
  allowedOrigins.add(`https://${host}`);
  if (appUrl.startsWith("http://localhost") || appUrl.startsWith("http://127.0.0.1")) {
    allowedOrigins.add(appUrl.replace(/\/$/, ""));
  }

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw Errors.forbidden("Cross-origin request rejected.");
  }
  if (!allowedOrigins.has(parsed.origin)) {
    throw Errors.forbidden("Cross-origin request rejected.");
  }
}

/** In dev, warn loudly if APP_URL is absent since origin checks need it. */
export function assertAppUrlConfigured(): void {
  if (!isProd && !process.env.APP_URL) {
    console.warn("[security] APP_URL is not set; origin checks will assume localhost.");
  }
}