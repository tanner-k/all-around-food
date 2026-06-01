/**
 * Dependency-free in-memory fixed-window rate limiter.
 *
 * IMPORTANT — production caveat:
 * The module-level Map lives in a single Node.js process. On Vercel each
 * serverless function instance has its own memory, so limits are enforced
 * per-instance, not globally. For strict per-user rate limiting in production
 * switch to a durable store (Vercel KV / Upstash Redis).
 */

interface WindowState {
  count: number;
  windowStart: number;
}

// Module-level store — one entry per (key, limit-config) pair.
const store = new Map<string, WindowState>();

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window resets. Present only when ok === false. */
  retryAfterSec?: number;
}

/**
 * Check whether a key (e.g. client IP + route) is within the rate limit.
 *
 * Uses a fixed-window algorithm: a counter resets every `windowMs`
 * milliseconds. Pure/synchronous — safe to call from any server context.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const { limit, windowMs } = options;
  const now = Date.now();

  const state = store.get(key);

  if (!state || now - state.windowStart >= windowMs) {
    // First request in a new window — reset the counter.
    store.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (state.count < limit) {
    state.count += 1;
    return { ok: true };
  }

  // Limit exceeded — compute retry-after.
  const windowEnd = state.windowStart + windowMs;
  const retryAfterSec = Math.ceil((windowEnd - now) / 1_000);
  return { ok: false, retryAfterSec };
}

/**
 * Clear all rate-limit state (test helper).
 */
export function clearRateLimitStore(): void {
  store.clear();
}
