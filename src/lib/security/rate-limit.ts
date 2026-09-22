import "server-only";

import { Errors } from "@/lib/errors";

/**
 * In-process sliding-window rate limiter.
 *
 * Suitable for development and single-instance deployments. For horizontal
 * scaling replace this module with a shared store (e.g. Redis) behind the
 * same `checkRateLimit` interface -- no call sites need to change.
 */

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

/** Keep the map from growing unboundedly. */
function cleanupIfNeeded(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    const oldest = now - MAX_WINDOW_MS;
    bucket.timestamps = bucket.timestamps.filter((t) => t > oldest);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

const MAX_WINDOW_MS = 60 * 60 * 1000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Allow `limit` requests per `windowMs` for a key.
 * Returns the decision and prune/handle accordingly.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  cleanupIfNeeded();
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter(
    (t) => now - t < windowMs,
  );
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]!;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000),
    );
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }
  bucket.timestamps.push(now);
  return { allowed: true, remaining: limit - bucket.timestamps.length, retryAfterSeconds: 0 };
}

export type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

export function checkRateLimitMany(rules: RateLimitRule[]): RateLimitResult {
  for (const rule of rules) {
    const result = checkRateLimit(rule.key, rule.limit, rule.windowMs);
    if (!result.allowed) return result;
  }
  return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };
}

/**
 * Route-handler guard: throws Too-Many-Requests when the key exceeds its
 * window budget. Add an IP component to keys that should be per-caller.
 */
export function enforceRateLimit(rules: RateLimitRule[]): void {
  const result = checkRateLimitMany(rules);
  if (!result.allowed) {
    throw Errors.tooManyRequests(`Too many requests. Retry in ${result.retryAfterSeconds}s.`);
  }
}