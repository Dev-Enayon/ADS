import "server-only";

import { apiError, getRequestContext, type ApiContext } from "@/lib/api";
import { assertSafeOrigin } from "@/lib/security/http";
import {
  enforceRateLimit,
  type RateLimitRule,
} from "@/lib/security/rate-limit";

type RouteOptions = {
  originCheck?: boolean;
  rateLimit?: RateLimitRule[] | ((ctx: ApiContext) => RateLimitRule[]);
};

type RouteHandler = (
  req: Request,
  ctx: ApiContext,
  routeContext?: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

/**
 * Standard wrapper for API route handlers:
 *  - CSRF/origin verification for state changes
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