/**
 * @vitest-environment node
 *
 * Unit tests for the in-memory rate limiter.
 * Pure — no network, no database, no secrets.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit, clearRateLimitStore } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request", () => {
    const result = checkRateLimit("ip-1", { limit: 3, windowMs: 60_000 });
    expect(result.ok).toBe(true);
    expect(result.retryAfterSec).toBeUndefined();
  });

  it("allows up to the limit within the window", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("ip-2", opts).ok).toBe(true);
    expect(checkRateLimit("ip-2", opts).ok).toBe(true);
    expect(checkRateLimit("ip-2", opts).ok).toBe(true);
  });

  it("blocks the (limit + 1)th request within the window", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    checkRateLimit("ip-3", opts);
    checkRateLimit("ip-3", opts);
    checkRateLimit("ip-3", opts);
    const result = checkRateLimit("ip-3", opts);
    expect(result.ok).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("provides retryAfterSec close to the remaining window time", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const opts = { limit: 1, windowMs: 60_000 };
    checkRateLimit("ip-4", opts); // hit the limit

    // Advance 10 s into the window
    vi.advanceTimersByTime(10_000);
    const result = checkRateLimit("ip-4", opts);
    expect(result.ok).toBe(false);
    // 50 s remain (ceil((60000 - 10000) / 1000))
    expect(result.retryAfterSec).toBe(50);
  });

  it("resets and allows requests after the window expires", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit("ip-5", opts);
    checkRateLimit("ip-5", opts);
    // Window exhausted
    expect(checkRateLimit("ip-5", opts).ok).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(60_001);
    const result = checkRateLimit("ip-5", opts);
    expect(result.ok).toBe(true); // new window
    expect(result.retryAfterSec).toBeUndefined();
  });

  it("tracks different keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    checkRateLimit("ip-A", opts); // exhausts ip-A
    const resultB = checkRateLimit("ip-B", opts);
    expect(resultB.ok).toBe(true); // ip-B is untouched
  });
});
