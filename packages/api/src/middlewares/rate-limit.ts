import { ORPCError } from "@orpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { os } from "../procedures";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "10 s"),
      analytics: true,
      prefix: "rl:api",
    });
  }
  return ratelimit;
}

/**
 * Rate limiting middleware — apply to sensitive routes like auth endpoints.
 * Falls back to no-op when Upstash env vars are absent (local dev without Redis).
 *
 * @param identifier  A function that derives a unique key from context (e.g. IP or user ID)
 * @param maxRequests Requests allowed in the sliding window
 * @param window      Window duration string, e.g. "10 s", "1 m"
 */
export function rateLimitMiddleware(
  identifier: (ctx: { headers: Headers }) => string,
  maxRequests = 20,
  window = "10 s",
) {
  return os.$context<{ headers: Headers }>().middleware(async ({ context, next }) => {
    const rl = getRatelimit();
    if (!rl) return next({ context });

    const key = identifier(context);
    const { success, limit, remaining, reset } = await rl.limit(key);

    if (!success) {
      throw new ORPCError("TOO_MANY_REQUESTS", {
        message: `Rate limit exceeded. Try again after ${new Date(reset).toISOString()}.`,
        data: { limit, remaining, reset },
      });
    }

    return next({ context });
  });
}

// Pre-built: limit per IP address
export const rateLimitByIp = rateLimitMiddleware(
  ({ headers }) =>
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown",
);

// Pre-built: limit per user ID (use on authenticated routes)
export const rateLimitByUser = rateLimitMiddleware(
  ({ headers }) => headers.get("x-user-id") ?? "anon",
  50,
  "10 s",
);
