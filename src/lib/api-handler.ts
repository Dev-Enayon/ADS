import "server-only";

import { apiError, getRequestContext, type ApiContext } from "@/lib/api";
import { assertSafeOrigin } from "@/lib/security/http";
import {
  enforceRateLimit,
  type RateLimitRule,
} from "@/lib/security/rate-limit";
import { maintenanceMode } from "@/lib/settings";
import { Errors } from "@/lib/errors";

type RouteOptions = {
  originCheck?: boolean;
  rateLimit?: RateLimitRule[] | ((ctx: ApiContext) => RateLimitRule[]);
};

type RouteHandler = (
  req: Request,
  ctx: ApiContext,
  routeContext?: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

// Writes are blocked during maintenance, but these must stay reachable so the
// platform can be recovered and so providers can always deliver webhooks.
const MAINTENANCE_EXEMPT_PREFIXES = ["/api/admin", "/api/webhooks", "/api/auth"];

async function assertWritesAllowed(req: Request): Promise<void> {
  if (req.method === "GET") return;
  const pathname = new URL(req.url).pathname;
  if (MAINTENANCE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return;
  if (await maintenanceMode()) {
    throw Errors.serviceUnavailable(
      "RewardHub is under maintenance. Please try again shortly.",
    );
  }
}

/**
 * Standard wrapper for API route handlers:
 *  - CSRF/origin verification for state changes
 *  - maintenance-mode gate for state-changing traffic
 *  - rate limiting
 *  - unified error -> JSON response
 */
export function route(opts: RouteOptions, handler: RouteHandler) {
  return async (
    req: Request,
    routeContext?: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const ctx = getRequestContext(req);
      if (opts.originCheck !== false) assertSafeOrigin(req);
      await assertWritesAllowed(req);
      if (opts.rateLimit) {
        const rules = Array.isArray(opts.rateLimit)
          ? opts.rateLimit
          : opts.rateLimit(ctx);
        enforceRateLimit(rules);
      }
      const result = await handler(req, ctx, routeContext);
      return result instanceof Response ? result : new Response(String(result));
    } catch (err) {
      return apiError(err);
    }
  };
}